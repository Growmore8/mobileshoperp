<?php

namespace App\Services;

use App\Models\Claim;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Expense;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Quotation;
use App\Models\Repair;
use App\Models\Sale;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\Warranty;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Developer-only permanent delete of one record, used to clean up test entries on a live shop.
 * Unlike normal deletes (which deactivate or void), the record and everything it caused are removed:
 * its stock movements, payments, warranties and device changes. Stock is then recounted from the
 * remaining movements, so "stock = sum of movements" still holds.
 * Records that later records depend on are refused with a message naming what to delete first.
 */
final class DevDelete
{
    public const TYPES = ['sale', 'purchase', 'product', 'repair', 'customer', 'supplier', 'expense', 'quotation'];

    public static function developers(): array
    {
        return array_filter(array_map(fn ($u) => strtolower(trim($u)), explode(',', (string) config('shop.developers'))));
    }

    public static function isDeveloper($user): bool
    {
        return $user && in_array(strtolower($user->username), self::developers(), true);
    }

    public static function delete(string $type, int $id): string
    {
        return DB::transaction(function () use ($type, $id) {
            $label = match ($type) {
                'sale' => self::sale(Sale::lockForUpdate()->findOrFail($id)),
                'purchase' => self::purchase(Purchase::lockForUpdate()->findOrFail($id)),
                'product' => self::product(Product::lockForUpdate()->findOrFail($id)),
                'repair' => self::repair(Repair::lockForUpdate()->findOrFail($id)),
                'customer' => self::customer(Customer::findOrFail($id)),
                'supplier' => self::supplier(Supplier::findOrFail($id)),
                'expense' => self::plain(Expense::findOrFail($id), 'Expense'),
                'quotation' => self::plain(Quotation::findOrFail($id), 'Quotation'),
            };
            Audit::log('settings', 'Developer delete', "$label was permanently deleted by the developer");

            return $label;
        });
    }

    private static function sale(Sale $s): string
    {
        $warranties = Warranty::where('sale_id', $s->id)->pluck('id');
        if (Claim::whereIn('warranty_id', $warranties)->exists() || DB::table('replacements')->where('sale_id', $s->id)->exists()) {
            Shop::fail("Sale {$s->no} has warranty claims. Delete or close those claims first.");
        }
        $products = $s->items()->pluck('product_id')->all();
        // units sold on this bill, including any returned since (their return movement carries the same number)
        $units = StockMovement::where('ref', $s->no)->whereNotNull('device_id')->pluck('device_id');
        Device::where('sale_id', $s->id)->orWhereIn('id', $units)->each(function (Device $d) use ($s) {
            $d->update(['status' => 'in_stock', 'customer_id' => null, 'sale_id' => null, 'sold_at' => null, 'warranty_id' => null]);
            $d->events()->where('ref', $s->no)->delete();
        });
        Warranty::whereIn('id', $warranties)->delete();
        self::undo($s->no, $products, $s);
        $s->delete();

        return "Sale {$s->no}";
    }

    private static function purchase(Purchase $p): string
    {
        $devices = Device::where('purchase_id', $p->id)->get();
        $busy = $devices->first(fn ($d) => $d->sale_id || ! in_array($d->status, ['in_stock', 'supplier_return'], true)
            || StockMovement::where('device_id', $d->id)->where('ref', '!=', $p->no)->exists());
        if ($busy) {
            Shop::fail("A unit from {$p->no} (".($busy->imei1 ?: $busy->serial).') has been sold or moved since. Delete that sale, repair or adjustment first.');
        }
        $products = $p->items()->pluck('product_id')->all();
        foreach ($p->items as $it) { // a quantity item already sold can't be un-received
            $prod = Product::find($it->product_id);
            if ($prod && $prod->tracking === 'qty' && $prod->qty - (int) StockMovement::where('ref', $p->no)->where('product_id', $prod->id)->sum('qty') < 0) {
                Shop::fail("{$prod->name} from {$p->no} has been sold since. Delete those sales first.");
            }
        }
        self::undo($p->no, $products, $p);
        Device::whereIn('id', $devices->pluck('id'))->delete();
        $p->delete();

        return "Purchase {$p->no}";
    }

    private static function product(Product $p): string
    {
        $ids = $p->children()->pluck('id')->push($p->id);
        foreach (['sale_items' => 'sales', 'purchase_items' => 'purchases', 'quotation_items' => 'quotations', 'repair_parts' => 'repairs'] as $table => $what) {
            if (DB::table($table)->whereIn('product_id', $ids)->exists()) {
                Shop::fail("{$p->name} is used in $what. Delete those $what first.");
            }
        }
        if (DB::table('replacements')->whereIn('old_product_id', $ids)->orWhereIn('new_product_id', $ids)->exists() || Warranty::whereIn('product_id', $ids)->exists()) {
            Shop::fail("{$p->name} has warranties. Delete the sales and repairs that created them first.");
        }
        StockMovement::whereIn('product_id', $ids)->delete();
        DB::table('stock_adjustments')->whereIn('product_id', $ids)->delete();
        Device::whereIn('product_id', $ids)->delete();
        Product::whereIn('id', $ids)->where('id', '!=', $p->id)->delete();
        $p->delete();

        return "Product {$p->name} ({$p->code})";
    }

    private static function repair(Repair $r): string
    {
        $warranties = Warranty::where('repair_id', $r->id)->pluck('id');
        if (Claim::whereIn('warranty_id', $warranties)->exists()) {
            Shop::fail("Repair {$r->no} has warranty claims. Delete or close those claims first.");
        }
        Warranty::whereIn('id', $warranties)->delete();
        self::undo($r->no, $r->parts()->pluck('product_id')->all(), $r);
        $r->delete();

        return "Repair {$r->no}";
    }

    private static function customer(Customer $c): string
    {
        foreach (['sales' => Sale::class, 'repairs' => Repair::class, 'warranty claims' => Claim::class] as $what => $model) {
            if ($model::where('customer_id', $c->id)->exists()) {
                Shop::fail("{$c->name} has $what. Delete those $what first.");
            }
        }
        $c->delete();

        return "Customer {$c->name} ({$c->code})";
    }

    private static function supplier(Supplier $s): string
    {
        if (Purchase::where('supplier_id', $s->id)->exists()) {
            Shop::fail("{$s->name} has purchases. Delete those purchases first.");
        }
        $s->delete();

        return "Supplier {$s->name} ({$s->code})";
    }

    private static function plain(Model $m, string $what): string
    {
        $m->delete();

        return trim("$what ".($m->no ?? $m->id));
    }

    /** Remove the record's stock movements and payments, then recount quantity stock from what remains. */
    private static function undo(string $ref, array $productIds, Model $payable): void
    {
        StockMovement::where('ref', $ref)->delete();
        Payment::where('payable_type', $payable->getMorphClass())->where('payable_id', $payable->getKey())->delete();
        Product::whereIn('id', array_unique($productIds))->where('tracking', 'qty')->each(
            fn (Product $p) => $p->update(['qty' => (int) StockMovement::where('product_id', $p->id)->sum('qty')])
        );
    }
}
