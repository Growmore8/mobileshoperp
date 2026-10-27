<?php

namespace App\Services;

use App\Models\Product;
use App\Models\Purchase;
use App\Models\Repair;
use App\Models\Sale;
use Illuminate\Support\Facades\DB;

/** Derived money values. Balances are always computed, never stored, so they cannot drift. */
final class Totals
{
    /**
     * Cart maths shared by POS sales and quotations.
     * $lines: [['product_id','qty','price','discount'], …] → adds line_total and tax to each line.
     * $discountPct (0–100), when given, replaces $orderDiscount with that share of the subtotal.
     */
    public static function cart(array &$lines, float $orderDiscount, ?float $discountPct = null): array
    {
        $vatOn = (bool) Shop::setting('tax_enabled', true);
        $rate = $vatOn ? (float) Shop::setting('tax_rate', 0) / 100 : 0.0;
        $inclusive = (bool) Shop::setting('tax_inclusive', true);
        $taxable = Product::whereIn('id', array_column($lines, 'product_id'))->pluck('taxable', 'id');

        $subtotal = 0.0;
        foreach ($lines as &$l) {
            $l['line_total'] = Shop::money($l['price'] * $l['qty'] - ($l['discount'] ?? 0));
            $subtotal += $l['line_total'];
        }
        unset($l);
        $subtotal = Shop::money($subtotal);
        $pct = $discountPct > 0 ? min(100.0, (float) $discountPct) : null;
        $disc = Shop::money($pct ? $subtotal * $pct / 100 : min(max(0, $orderDiscount), $subtotal));

        $tax = 0.0;
        foreach ($lines as &$l) {
            $share = $subtotal > 0 ? $l['line_total'] / $subtotal : 0;
            $net = $l['line_total'] - $disc * $share;
            $l['tax'] = ($taxable[$l['product_id']] ?? true) ? Shop::money($inclusive ? $net - $net / (1 + $rate) : $net * $rate) : 0.0;
            $tax += $l['tax'];
        }
        unset($l);
        $tax = Shop::money($tax);

        return [
            'subtotal' => $subtotal, 'discount' => $disc, 'discount_percent' => $pct, 'tax' => $tax, 'tax_rate' => $rate * 100, 'tax_inclusive' => $inclusive,
            'total' => Shop::money($inclusive ? $subtotal - $disc : $subtotal - $disc + $tax),
        ];
    }

    public static function sale(Sale $s): array
    {
        $returned = Shop::money($s->returns()->sum('amount'));
        $paid = Shop::money($s->payments()->sum('amount'));
        $net = Shop::money($s->total - $returned);

        return ['net' => $net, 'paid' => $paid, 'returned' => $returned, 'balance' => $s->status === 'cancelled' ? 0.0 : Shop::money($net - $paid)];
    }

    public static function repair(Repair $r): array
    {
        $parts = $r->parts()->get();
        $partsCharged = $parts->where('covered', false)->sum(fn ($p) => $p->price * $p->qty);
        $labor = $r->labor_covered ? 0 : (float) $r->labor;
        $total = max(0, Shop::money($partsCharged + $labor - $r->discount));
        $paid = Shop::money($r->payments()->sum('amount'));

        return [
            'parts_all' => Shop::money($parts->sum(fn ($p) => $p->price * $p->qty)),
            'parts' => Shop::money($partsCharged),
            'labor' => Shop::money($labor),
            'total' => $total,
            'paid' => $paid,
            'balance' => $r->status === 'cancelled' ? 0.0 : Shop::money($total - $paid),
            'cost' => Shop::money($parts->sum(fn ($p) => $p->cost * $p->qty) + $r->tech_cost),
            'covered_value' => Shop::money($parts->where('covered', true)->sum(fn ($p) => $p->price * $p->qty) + ($r->labor_covered ? $r->labor : 0)),
        ];
    }

    public static function purchase(Purchase $p): array
    {
        $returned = Shop::money($p->returns()->sum('amount'));
        $paid = Shop::money($p->payments()->sum('amount'));
        $net = Shop::money($p->total - $returned);

        return ['net' => $net, 'paid' => $paid, 'returned' => $returned, 'balance' => $p->status === 'received' ? Shop::money($net - $paid) : 0.0];
    }

    public static function customerBalance(int $customerId): float
    {
        $sales = Sale::where('customer_id', $customerId)->where('status', '!=', 'cancelled')->get()->sum(fn ($s) => self::sale($s)['balance']);
        $repairs = Repair::where('customer_id', $customerId)->where('status', 'delivered')->get()->sum(fn ($r) => self::repair($r)['balance']);

        return Shop::money($sales + $repairs);
    }

    public static function supplierBalance(int $supplierId): float
    {
        return Shop::money(Purchase::where('supplier_id', $supplierId)->where('status', 'received')->get()->sum(fn ($p) => self::purchase($p)['balance']));
    }

    /** Value of sellable stock at cost (actual IMEI cost + weighted average for quantity items). */
    public static function stockValue(): float
    {
        $qty = (float) DB::table('products')->where('tracking', 'qty')->where('active', true)->selectRaw('COALESCE(SUM(qty * cost),0) v')->value('v');
        $dev = (float) DB::table('devices')->where('status', 'in_stock')->sum('cost');

        return Shop::money($qty + $dev);
    }
}
