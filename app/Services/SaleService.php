<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Device;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Quotation;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\SaleReturn;
use App\Models\Warranty;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class SaleService
{
    /**
     * POS checkout.
     * $d = customer_id?, items[{product_id, device_id?, qty, price, discount?}], discount?, payments[{method, amount, reference?}], allow_credit?, note?
     */
    public static function create(array $d): Sale
    {
        $canEditPrice = Shop::can('pos', 'edit');

        return DB::transaction(function () use ($d, $canEditPrice) {
            if (empty($d['items'])) {
                Shop::fail('The cart is empty.');
            }
            $cust = ! empty($d['customer_id']) ? Customer::findOrFail($d['customer_id']) : null;
            $seen = [];
            $lines = [];
            $warrantyChoice = [];
            foreach ($d['items'] as $it) {
                $p = Product::lockForUpdate()->find($it['product_id']);
                if (! $p || ! $p->active) {
                    Shop::fail('A product in the cart is no longer available.');
                }
                $qty = (int) $it['qty'];
                if ($qty < 1) {
                    Shop::fail("{$p->name}: invalid quantity.");
                }
                $device = null;
                if ($p->tracking !== 'qty') {
                    $device = ! empty($it['device_id']) ? Device::lockForUpdate()->find($it['device_id']) : null;
                    if (! $device || $device->product_id !== $p->id) {
                        Shop::fail("{$p->name}: select the IMEI / serial number being sold.");
                    }
                    if ($device->status !== 'in_stock') {
                        Shop::fail(Inventory::code($device).' is not available ('.Inventory::label($device->status).').');
                    }
                    if (isset($seen[$device->id])) {
                        Shop::fail(Inventory::code($device).' is in the cart more than once.');
                    }
                    $seen[$device->id] = true;
                    $qty = 1;
                    // the seller must choose the warranty period for every phone / serialized unit (0 = no warranty)
                    $wm = $it['warranty_months'] ?? null;
                    if ($wm === null || $wm === '' || (int) $wm < 0 || (int) $wm > 60) {
                        Shop::fail("{$p->name} (".Inventory::code($device).'): select the warranty period.');
                    }
                } else {
                    $already = collect($lines)->where('product_id', $p->id)->sum('qty');
                    if ($qty + $already > $p->qty) {
                        Shop::fail("{$p->name}: only {$p->qty} in stock.");
                    }
                }
                $price = Shop::money($it['price'] ?? $p->price);
                $disc = Shop::money($it['discount'] ?? 0);
                if (($price != $p->price || $disc > 0) && ! $canEditPrice) {
                    Shop::fail('You are not allowed to change prices or give line discounts.', 403);
                }
                $lines[] = [
                    'product_id' => $p->id, 'device_id' => $device?->id, 'qty' => $qty, 'price' => $price, 'discount' => $disc,
                    'cost' => $device ? $device->cost : $p->cost, 'name' => $p->name, 'code' => $device ? Inventory::code($device) : null,
                ];
                $warrantyChoice[] = $device ? (int) $it['warranty_months'] : null;
            }
            $orderDiscount = Shop::money($d['discount'] ?? 0);
            $discountPct = (float) ($d['discount_percent'] ?? 0);
            if (($orderDiscount > 0 || $discountPct > 0) && ! $canEditPrice) {
                Shop::fail('You are not allowed to apply invoice discounts.', 403);
            }
            $t = Totals::cart($lines, $orderDiscount, $discountPct);

            // payments: over-payment only in cash (change), short payment only with a customer + explicit credit
            $pays = collect($d['payments'] ?? [])->filter(fn ($p) => (float) $p['amount'] > 0)->map(fn ($p) => ['method' => $p['method'], 'amount' => Shop::money($p['amount']), 'reference' => $p['reference'] ?? null])->values()->all();
            $paid = Shop::money(array_sum(array_column($pays, 'amount')));
            $change = 0.0;
            if ($paid > $t['total']) {
                $change = Shop::money($paid - $t['total']);
                $i = collect($pays)->search(fn ($p) => $p['method'] === 'Cash' && $p['amount'] >= $change);
                if ($i === false) {
                    Shop::fail('Overpayment is only allowed in cash (to give change).');
                }
                $pays[$i]['amount'] = Shop::money($pays[$i]['amount'] - $change);
                $paid = $t['total'];
            }
            if ($paid < $t['total']) {
                if (! $cust) {
                    Shop::fail('Partial payment / credit requires a registered customer (not walk-in).');
                }
                if (empty($d['allow_credit'])) {
                    Shop::fail('Payment is short by '.Shop::fmt($t['total'] - $paid).'. Confirm partial payment to record the balance as outstanding.');
                }
            }

            $sale = Sale::create([
                'no' => DocNumber::next('invoice', Shop::setting('invoice_prefix', 'INV-')), 'date' => Carbon::today(),
                'customer_id' => $cust?->id, 'user_id' => Auth::id(), 'change_given' => $change, 'note' => $d['note'] ?? null, 'status' => 'completed',
            ] + $t);
            foreach ($pays as $p) {
                $sale->payments()->create($p + ['kind' => 'receipt', 'user_id' => Auth::id()]);
            }
            foreach ($lines as $idx => $l) {
                $item = $sale->items()->create($l);
                if ($l['device_id']) {
                    $dev = Device::find($l['device_id']);
                    $dev->update(['status' => 'sold', 'sale_id' => $sale->id, 'customer_id' => $sale->customer_id, 'sold_at' => now()]);
                    Inventory::event($dev, 'Sold', $sale->no, 'Sold to '.($cust?->name ?? 'Walk-in customer').' for '.Shop::fmt($l['price'] - $l['discount']));
                    Inventory::move($l['product_id'], -1, 'Sale', $sale->no, null, $dev->id);
                    if ($w = WarrantyService::registerForSale($sale, $item, $dev, $warrantyChoice[$idx])) {
                        $item->update(['warranty_id' => $w->id]);
                        $dev->update(['warranty_id' => $w->id]);
                    }
                } else {
                    Product::whereKey($l['product_id'])->decrement('qty', $l['qty']);
                    Inventory::move($l['product_id'], -$l['qty'], 'Sale', $sale->no);
                    if ($w = WarrantyService::registerForSale($sale, $item, null)) {
                        $item->update(['warranty_id' => $w->id]);
                    }
                }
            }
            Audit::log('sales', 'Sale completed', "{$sale->no} — ".($cust?->name ?? 'Walk-in').' — '.Shop::fmt($sale->total).($paid < $sale->total ? ' (balance '.Shop::fmt($sale->total - $paid).')' : ''), $sale->no);

            return $sale;
        });
    }

    public static function quote(array $d): Quotation
    {
        return DB::transaction(function () use ($d) {
            if (empty($d['items'])) {
                Shop::fail('The cart is empty.');
            }
            $lines = collect($d['items'])->map(fn ($it) => [
                'product_id' => $it['product_id'], 'qty' => (int) $it['qty'], 'price' => Shop::money($it['price']), 'discount' => Shop::money($it['discount'] ?? 0),
                'name' => Product::findOrFail($it['product_id'])->name,
            ])->all();
            $t = Totals::cart($lines, (float) ($d['discount'] ?? 0), (float) ($d['discount_percent'] ?? 0));
            unset($t['tax_inclusive']);
            $q = Quotation::create(['no' => DocNumber::next('quote', 'QT-'), 'date' => Carbon::today(), 'valid_until' => Carbon::today()->addDays(7),
                'customer_id' => $d['customer_id'] ?? null, 'user_id' => Auth::id(), 'note' => $d['note'] ?? null] + $t);
            $q->items()->createMany(array_map(fn ($l) => collect($l)->except('tax')->all(), $lines));
            Audit::log('sales', 'Quotation created', "{$q->no} — ".Shop::fmt($q->total), $q->no);

            return $q;
        });
    }

    public static function pay(Sale $sale, string $method, float $amount, ?string $ref = null): Payment
    {
        return DB::transaction(function () use ($sale, $method, $amount, $ref) {
            $sale = Sale::lockForUpdate()->findOrFail($sale->id);
            $bal = Totals::sale($sale)['balance'];
            $amount = Shop::money($amount);
            if ($amount <= 0) {
                Shop::fail('Enter an amount above zero.');
            }
            if ($amount > $bal + 0.001) {
                Shop::fail('Amount exceeds the balance due ('.Shop::fmt($bal).').');
            }
            $p = $sale->payments()->create(['kind' => 'receipt', 'method' => $method, 'amount' => $amount, 'reference' => $ref, 'user_id' => Auth::id()]);
            Audit::log('sales', 'Payment received', Shop::fmt($amount)." ($method) for {$sale->no}", $sale->no);

            return $p;
        });
    }

    /**
     * Return / refund. $lines = [['item_id', 'qty']], $restock = stock | inspect | damaged.
     * Refund = amount paid above the new invoice total. Warranties of returned devices are voided.
     */
    public static function refund(Sale $sale, array $lines, string $reason, string $restock = 'inspect', string $method = 'Cash'): SaleReturn
    {
        return DB::transaction(fn () => self::returnLines(Sale::lockForUpdate()->findOrFail($sale->id), $lines, $reason, $restock, $method));
    }

    private static function returnLines(Sale $s, array $lines, string $reason, string $restock, string $method): SaleReturn
    {
        if ($s->status === 'cancelled') {
            Shop::fail('This invoice is cancelled.');
        }
        if (mb_strlen(trim($reason)) < 3) {
            Shop::fail('Enter a reason for the return / refund.');
        }
        $before = Totals::sale($s);
        $amount = 0.0;
        $desc = [];
        foreach ($lines as $ln) {
            $qty = (int) ($ln['qty'] ?? 0);
            if ($qty < 1) {
                continue;
            }
            /** @var SaleItem $it */
            $it = $s->items()->whereKey($ln['item_id'])->lockForUpdate()->first();
            if (! $it) {
                Shop::fail('Item does not belong to this invoice.');
            }
            $avail = $it->qty - $it->returned_qty;
            if ($qty > $avail) {
                Shop::fail("{$it->name}: only $avail can be returned.");
            }
            // value of returned goods including its share of the invoice discount (+ tax when prices are tax-exclusive)
            $unitNet = ($it->line_total / $it->qty) * (1 - ($s->subtotal > 0 ? $s->discount / $s->subtotal : 0));
            $amount += $s->tax_inclusive ? $unitNet * $qty : ($unitNet + $it->tax / $it->qty) * $qty;
            $it->increment('returned_qty', $qty);

            if ($it->device_id) {
                $dev = Device::lockForUpdate()->find($it->device_id);
                $status = ['stock' => 'in_stock', 'damaged' => 'damaged'][$restock] ?? 'returned';
                $dev->update(['status' => $status, 'condition' => $restock === 'damaged' ? 'damaged' : $dev->condition, 'customer_id' => null, 'sale_id' => null]);
                Inventory::event($dev, 'Customer return', $s->no, "$reason → ".Inventory::label($status));
                Inventory::move($it->product_id, $status === 'in_stock' ? 1 : 0, $status === 'in_stock' ? 'Sales return' : 'Sales return ('.Inventory::label($status).')', $s->no, $reason, $dev->id);
            } elseif ($restock === 'stock') {
                Product::whereKey($it->product_id)->increment('qty', $qty);
                Inventory::move($it->product_id, $qty, 'Sales return', $s->no, $reason);
            } else {
                Inventory::move($it->product_id, 0, 'Sales return (not restocked)', $s->no, "$qty unit(s): $reason");
            }
            if ($it->warranty_id && ($it->device_id || $it->returned_qty >= $it->qty)) {
                $w = Warranty::find($it->warranty_id);
                if ($w && $w->status === 'active') {
                    $w->update(['status' => 'void', 'void_reason' => "Product returned on {$s->no}"]);
                    WarrantyService::event($w, 'Voided', "Product returned: $reason");
                }
            }
            $desc[] = "$qty × {$it->name}".($it->code ? " ({$it->code})" : '');
        }
        if (! $desc) {
            Shop::fail('Select at least one item to return.');
        }
        $amount = Shop::money($amount);
        $refund = Shop::money(max(0, $before['paid'] - ($before['net'] - $amount)));
        $ret = $s->returns()->create(['amount' => $amount, 'refund' => $refund, 'method' => $method, 'restock' => $restock, 'reason' => $reason, 'items' => $desc, 'user_id' => Auth::id()]);
        if ($refund > 0) {
            $s->payments()->create(['kind' => 'refund', 'method' => $method, 'amount' => -$refund, 'reference' => 'Refund', 'user_id' => Auth::id()]);
        }
        $allBack = $s->items()->get()->every(fn ($i) => $i->returned_qty >= $i->qty);
        $s->update(['status' => $allBack ? 'refunded' : 'partially_refunded']);
        Audit::log('sales', 'Return / refund', "{$s->no}: ".implode(', ', $desc).' — value '.Shop::fmt($amount).', refunded '.Shop::fmt($refund)." ($method). Reason: $reason", $s->no);

        return $ret;
    }

    /** Cancel keeps the invoice for audit, restores stock, voids warranties and refunds payments. */
    public static function cancel(Sale $sale, string $reason): Sale
    {
        if ($sale->status !== 'completed') {
            Shop::fail('Only invoices without returns can be cancelled. Use Return / Refund instead.');
        }
        if (! $sale->date->isToday() && ! Shop::can('sales', 'approve')) {
            Shop::fail('Invoices from previous days can only be cancelled by a user with the Sales “Approve” permission.', 403);
        }
        if (mb_strlen(trim($reason)) < 3) {
            Shop::fail('Enter a cancellation reason.');
        }

        return DB::transaction(function () use ($sale, $reason) {
            $s = Sale::lockForUpdate()->findOrFail($sale->id);
            $method = $s->payments()->value('method') ?? 'Cash';
            self::returnLines($s, $s->items->map(fn ($i) => ['item_id' => $i->id, 'qty' => $i->qty])->all(), "Invoice cancelled: $reason", 'stock', $method);
            $s->update(['status' => 'cancelled', 'cancel_reason' => $reason, 'cancelled_by' => Auth::id(), 'cancelled_at' => now()]);
            Audit::log('sales', 'Invoice cancelled', "{$s->no}: $reason", $s->no);

            return $s;
        });
    }
}
