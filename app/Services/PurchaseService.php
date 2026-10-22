<?php

namespace App\Services;

use App\Models\Device;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\PurchaseReturn;
use App\Models\Supplier;
use App\Support\Imei;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class PurchaseService
{
    /**
     * Create a purchase order (status ordered) or receive goods (status received), optionally receiving an existing PO.
     * $d = supplier_id, status, supplier_invoice?, date?, expected_date?, note?, paid?, method?,
     *      items[{product_id, qty, cost, condition?, units?[{imei1, imei2?, serial?}]}]
     */
    public static function save(array $d, ?Purchase $po = null): Purchase
    {
        $receive = $d['status'] === 'received';

        return DB::transaction(function () use ($d, $po, $receive) {
            $sup = Supplier::findOrFail($d['supplier_id']);
            if (empty($d['items'])) {
                Shop::fail('Add at least one product line.');
            }
            if ($po) {
                $po = Purchase::lockForUpdate()->findOrFail($po->id);
                if ($po->status !== 'ordered') {
                    Shop::fail('This purchase has already been '.$po->status.'.');
                }
            }
            $seen = [];
            foreach ($d['items'] as &$it) {
                $p = Product::findOrFail($it['product_id']);
                $it['qty'] = (int) $it['qty'];
                $it['cost'] = Shop::money($it['cost'] ?? $p->cost);
                if ($it['qty'] < 1) {
                    Shop::fail("{$p->name}: quantity must be at least 1.");
                }
                if ($receive && $p->tracking !== 'qty') {
                    $units = $it['units'] ?? [];
                    $label = $p->tracking === 'imei' ? 'IMEI' : 'serial';
                    if (count($units) !== $it['qty']) {
                        Shop::fail("{$p->name}: {$it['qty']} unit(s) but ".count($units)." $label number(s) entered.");
                    }
                    foreach ($units as $u) {
                        if ($p->tracking === 'imei') {
                            if (! Imei::valid($u['imei1'] ?? '')) {
                                Shop::fail("{$p->name}: “".($u['imei1'] ?? '')."” is not a valid 15-digit IMEI (check digit failed).");
                            }
                            if (! empty($u['imei2']) && ! Imei::valid($u['imei2'])) {
                                Shop::fail("{$p->name}: second IMEI “{$u['imei2']}” is not valid.");
                            }
                        } elseif (strlen(Imei::normalize($u['serial'] ?? '')) < 5) {
                            Shop::fail("{$p->name}: serial numbers must be at least 5 characters.");
                        }
                        foreach (array_filter([$u['imei1'] ?? null, $u['imei2'] ?? null, $u['serial'] ?? null]) as $code) {
                            $k = Imei::normalize($code);
                            if (isset($seen[$k])) {
                                Shop::fail("Duplicate number in this receipt: $code");
                            }
                            $seen[$k] = true;
                            if ($ex = Inventory::findDevice($k)) {
                                Shop::fail("$code is already registered to {$ex->product->name} (".Inventory::label($ex->status).'). Duplicate IMEI/serial registration is blocked.');
                            }
                        }
                    }
                }
            }
            unset($it);

            $rec = $po ?? new Purchase(['no' => DocNumber::next('purchase', 'PUR-'), 'created_by' => Auth::id()]);
            $rec->fill([
                'supplier_id' => $sup->id, 'supplier_invoice' => $d['supplier_invoice'] ?? $rec->supplier_invoice, 'date' => $d['date'] ?? now()->toDateString(),
                'expected_date' => $d['expected_date'] ?? $rec->expected_date, 'note' => $d['note'] ?? $rec->note, 'status' => $receive ? 'received' : 'ordered',
                'total' => Shop::money(collect($d['items'])->sum(fn ($i) => $i['qty'] * $i['cost'])),
            ]);
            if ($receive) {
                $rec->received_at = now();
                $rec->received_by = Auth::id();
            }
            $rec->save();
            $rec->items()->delete();

            foreach ($d['items'] as $it) {
                $p = Product::lockForUpdate()->find($it['product_id']);
                $rec->items()->create(['product_id' => $p->id, 'qty' => $it['qty'], 'cost' => $it['cost'], 'condition' => $it['condition'] ?? $p->condition]);
                if (! $receive) {
                    continue;
                }
                if ($p->tracking !== 'qty') {
                    foreach ($it['units'] as $u) {
                        $dev = Inventory::register($p, $u, [
                            'condition' => $it['condition'] ?? $p->condition, 'status' => 'in_stock', 'cost' => $it['cost'],
                            'supplier_id' => $sup->id, 'purchase_id' => $rec->id,
                        ]);
                        Inventory::event($dev, 'Purchased', $rec->no, "Received from {$sup->name}".($rec->supplier_invoice ? " (inv. {$rec->supplier_invoice})" : '').' at '.Shop::fmt($it['cost']));
                        Inventory::move($p->id, 1, 'Purchase', $rec->no, null, $dev->id);
                    }
                } else {
                    // weighted average costing for quantity items
                    $old = max(0, (int) $p->qty);
                    $p->cost = Shop::money($old + $it['qty'] > 0 ? ($old * $p->cost + $it['qty'] * $it['cost']) / ($old + $it['qty']) : $it['cost']);
                    $p->qty = $p->qty + $it['qty'];
                    $p->save();
                    Inventory::move($p->id, $it['qty'], 'Purchase', $rec->no);
                }
            }
            if ($receive && ($d['paid'] ?? 0) > 0) {
                $rec->payments()->create(['kind' => 'supplier_payment', 'method' => $d['method'] ?? 'Cash', 'amount' => Shop::money(min($d['paid'], $rec->total)), 'user_id' => Auth::id()]);
            }
            $units = collect($d['items'])->sum('qty');
            Audit::log('purchases', $receive ? 'Stock received' : 'Purchase order created', "{$rec->no} ".($receive ? 'from' : 'to')." {$sup->name} — $units unit(s), ".Shop::fmt($rec->total), $rec->no);

            return $rec->fresh('items');
        });
    }

    public static function cancel(Purchase $p, string $reason): Purchase
    {
        if ($p->status !== 'ordered') {
            Shop::fail('Only open purchase orders can be cancelled.');
        }
        $p->update(['status' => 'cancelled', 'cancel_reason' => $reason, 'cancelled_at' => now()]);
        Audit::log('purchases', 'Purchase order cancelled', "{$p->no}: $reason", $p->no);

        return $p;
    }

    public static function pay(Purchase $p, float $amount, string $method, ?string $note = null): Payment
    {
        return DB::transaction(function () use ($p, $amount, $method, $note) {
            $p = Purchase::lockForUpdate()->findOrFail($p->id);
            $bal = Totals::purchase($p)['balance'];
            $amount = Shop::money($amount);
            if ($amount <= 0) {
                Shop::fail('Enter a payment amount above zero.');
            }
            if ($amount > $bal + 0.001) {
                Shop::fail('Amount exceeds the outstanding balance of '.Shop::fmt($bal).'.');
            }
            $pay = $p->payments()->create(['kind' => 'supplier_payment', 'method' => $method, 'amount' => $amount, 'reference' => $note, 'user_id' => Auth::id()]);
            Audit::log('purchases', 'Supplier payment', Shop::fmt($amount)." paid to {$p->supplier->name} for {$p->no} ($method)", $p->no);

            return $pay;
        });
    }

    /** Return defective / wrong goods to the supplier (also used for warranty RMA of replaced units). */
    public static function returnToSupplier(Purchase $p, array $deviceIds, array $lines, string $reason): PurchaseReturn
    {
        return DB::transaction(function () use ($p, $deviceIds, $lines, $reason) {
            $p = Purchase::lockForUpdate()->findOrFail($p->id);
            if ($p->status !== 'received') {
                Shop::fail('Only received purchases can be returned.');
            }
            $amount = 0.0;
            $desc = [];
            foreach ($deviceIds as $id) {
                $d = Device::lockForUpdate()->find($id);
                if (! $d || $d->purchase_id !== $p->id) {
                    Shop::fail('A selected unit does not belong to this purchase.');
                }
                if (! in_array($d->status, ['in_stock', 'damaged', 'returned', 'warranty_return'], true)) {
                    Shop::fail(Inventory::code($d).' is '.Inventory::label($d->status).' and cannot be returned to the supplier.');
                }
                $sellable = $d->status === 'in_stock';
                $d->update(['status' => 'supplier_return']);
                Inventory::event($d, 'Returned to supplier', $p->no, $reason);
                Inventory::move($d->product_id, $sellable ? -1 : 0, $sellable ? 'Purchase return' : 'Purchase return (non-sellable unit)', $p->no, $reason, $d->id);
                $amount += $d->cost;
                $desc[] = Inventory::code($d);
            }
            foreach ($lines as $ln) {
                $qty = (int) ($ln['qty'] ?? 0);
                if ($qty < 1) {
                    continue;
                }
                $prod = Product::lockForUpdate()->findOrFail($ln['product_id']);
                $line = $p->items()->where('product_id', $prod->id)->first();
                if (! $line) {
                    Shop::fail("{$prod->name} is not on this purchase.");
                }
                if ($qty > $prod->qty) {
                    Shop::fail("{$prod->name}: only {$prod->qty} in stock.");
                }
                $prod->decrement('qty', $qty);
                Inventory::move($prod->id, -$qty, 'Purchase return', $p->no, $reason);
                $amount += $qty * $line->cost;
                $desc[] = "$qty × {$prod->name}";
            }
            if (! $desc) {
                Shop::fail('Select at least one item to return.');
            }
            $ret = $p->returns()->create(['amount' => Shop::money($amount), 'reason' => $reason, 'items' => $desc, 'user_id' => Auth::id()]);
            Audit::log('purchases', 'Purchase return', "{$p->no}: ".implode(', ', $desc).' — credit '.Shop::fmt($amount).". $reason", $p->no);

            return $ret;
        });
    }
}
