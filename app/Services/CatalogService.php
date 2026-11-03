<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Expense;
use App\Models\Product;
use App\Models\Repair;
use App\Models\Sale;
use App\Models\StockMovement;
use App\Models\Supplier;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/** Products, customers, suppliers, expenses. */
class CatalogService
{
    /** What every model copies from its product, so a model differs only in name, codes, prices and stock. */
    private const MODEL_SHARED = ['category_id', 'brand', 'model', 'color', 'storage', 'ram', 'tracking', 'condition', 'warranty_months', 'warranty_provider',
        'used_warranty_months', 'repair_warranty_days', 'taxable', 'discountable', 'supplier_id', 'description'];

    /**
     * $d['models'] (optional) = [{id?, variant, code?, sku?, barcode?, cost?, price, min_stock?, active?}]: the product
     * becomes a group ("Back covers") and each row is a model with its own price and stock ("Back covers – iPhone 11").
     */
    public static function saveProduct(array $d, ?Product $p = null): Product
    {
        return DB::transaction(function () use ($d, $p) {
            $models = array_key_exists('models', $d) ? $d['models'] : null;
            unset($d['models']);
            if ($p) {
                if ($p->parent_id) { // a model is always named after its product
                    $d['name'] = self::modelName($p->parent, $d['variant'] ?? $p->variant);
                }
                $hasMoves = StockMovement::whereIn('product_id', $p->children()->pluck('id')->push($p->id))->exists();
                if ($hasMoves && isset($d['tracking']) && $d['tracking'] !== $p->tracking) {
                    Shop::fail('Tracking type cannot be changed after stock movements exist.');
                }
                $changes = [];
                if (! $p->has_models && isset($d['price']) && (float) $d['price'] !== $p->price) {
                    $changes[] = 'price '.Shop::fmt($p->price).' → '.Shop::fmt($d['price']);
                }
                if (! $p->has_models && isset($d['cost']) && (float) $d['cost'] !== $p->cost) {
                    $changes[] = 'cost '.Shop::fmt($p->cost).' → '.Shop::fmt($d['cost']);
                }
                if (isset($d['warranty_months']) && (int) $d['warranty_months'] !== $p->warranty_months) {
                    $changes[] = "warranty {$p->warranty_months}m → {$d['warranty_months']}m";
                }
                unset($d['qty']); // stock only changes through movements
                $p->update($d);
                Audit::log('products', 'Product updated', $p->name.($changes ? ' — '.implode(', ', $changes) : ''), $p->code);
            } else {
                $d['code'] = $d['code'] ?? null ?: DocNumber::next('product', 'P-');
                $p = Product::create(collect($d)->except('qty')->all() + ['qty' => 0]);
                Audit::log('products', 'Product created', "{$p->name} ({$p->code})", $p->code);
            }
            if ($models !== null) {
                self::saveModels($p, $models);
            } elseif ($p->has_models) { // product details changed: copy them to its models
                self::saveModels($p, $p->children()->get()->map(fn ($m) => ['id' => $m->id, 'variant' => $m->variant, 'active' => $p->wasChanged('active') ? true : $m->active])->all());
            }

            return $p->fresh();
        });
    }

    public static function modelName(Product $parent, ?string $variant): string
    {
        return mb_substr($parent->name.' – '.trim((string) $variant), 0, 255);
    }

    private static function saveModels(Product $parent, array $rows): void
    {
        $parent->refresh(); // column defaults (condition, warranty…) of a just-created product
        $existing = $parent->children()->get()->keyBy('id');
        if (! $rows) {
            if ($existing->isNotEmpty()) {
                Shop::fail('Keep at least one model. To stop selling this product, untick Active instead.');
            }

            return;
        }
        if (! $parent->has_models && ($parent->qty != 0 || StockMovement::where('product_id', $parent->id)->exists() || $parent->devices()->exists())) {
            Shop::fail("{$parent->name} already has stock history, so models can't be added to it. Create a new product for the models instead.");
        }
        $seen = ['variant' => [], 'code' => [], 'sku' => [], 'barcode' => []];
        $keep = [];
        foreach ($rows as $row) {
            $variant = trim((string) $row['variant']);
            $m = ! empty($row['id']) ? $existing->get((int) $row['id']) : null;
            if (! empty($row['id']) && ! $m) {
                Shop::fail("Model “{$variant}” does not belong to {$parent->name}.");
            }
            foreach (['variant' => $variant, 'code' => $row['code'] ?? null, 'sku' => $row['sku'] ?? null, 'barcode' => $row['barcode'] ?? null] as $f => $v) {
                if ($v === null || $v === '') {
                    continue;
                }
                $label = ['variant' => 'Model', 'code' => 'Code', 'sku' => 'SKU', 'barcode' => 'Barcode'][$f];
                if (in_array(mb_strtolower($v), $seen[$f], true)) {
                    Shop::fail("$label “{$v}” is listed twice.");
                }
                $seen[$f][] = mb_strtolower($v);
                if ($f !== 'variant' && Product::where($f, $v)->when($m, fn ($q) => $q->where('id', '!=', $m->id))->exists()) {
                    Shop::fail("$label “{$v}” is already used by another product.");
                }
            }
            $attrs = $parent->only(self::MODEL_SHARED) + [
                'parent_id' => $parent->id, 'has_models' => false, 'variant' => $variant, 'name' => self::modelName($parent, $variant),
                'active' => $parent->active && ($row['active'] ?? true),
            ];
            foreach (['price', 'cost', 'sku', 'barcode', 'min_stock'] as $f) {
                if (array_key_exists($f, $row)) {
                    $attrs[$f] = $f === 'min_stock' ? (int) $row[$f] : ($row[$f] === '' ? null : $row[$f]);
                }
            }
            if (! empty($row['code'])) {
                $attrs['code'] = $row['code'];
            }
            if ($m) {
                if (isset($attrs['price']) && (float) $attrs['price'] !== $m->price) {
                    Audit::log('products', 'Product updated', "{$m->name} — price ".Shop::fmt($m->price).' → '.Shop::fmt($attrs['price']), $m->code);
                }
                $m->update($attrs);
            } else {
                $attrs['code'] = $attrs['code'] ?? self::nextModelCode($parent);
                $m = Product::create($attrs + ['qty' => 0, 'cost' => 0, 'min_stock' => $parent->min_stock, 'wholesale' => 0]);
                Audit::log('products', 'Model added', "{$m->name} ({$m->code})", $m->code);
            }
            $keep[] = $m->id;
        }
        foreach ($existing->except($keep) as $old) {
            if ($old->active || ! StockMovement::where('product_id', $old->id)->exists()) { // removed earlier and kept for its history: leave as is
                self::deleteProduct($old);
            }
        }
        $kept = Product::whereIn('id', $keep)->get();
        $parent->update(['has_models' => true, 'price' => (float) $kept->min('price'), 'cost' => (float) $kept->min('cost')]);
    }

    private static function nextModelCode(Product $parent): string
    {
        for ($i = $parent->children()->count() + 1; ; $i++) {
            $code = mb_substr($parent->code, 0, 16).'-'.str_pad((string) $i, 2, '0', STR_PAD_LEFT);
            if (! Product::where('code', $code)->exists()) {
                return $code;
            }
        }
    }

    /** Products with history are deactivated, never deleted. A product with models takes its models with it. */
    public static function deleteProduct(Product $p): string
    {
        $kept = $p->children()->get()->map(fn ($m) => self::deleteProduct($m))->contains('deactivated');
        if ($kept || StockMovement::where('product_id', $p->id)->exists()) {
            $p->update(['active' => false]);
            Audit::log('products', 'Product deactivated', "{$p->name} has history, so it was deactivated instead of deleted", $p->code);

            return 'deactivated';
        }
        $p->delete();
        Audit::log('products', 'Product deleted', $p->name, $p->code);

        return 'deleted';
    }

    public static function saveCustomer(array $d, ?Customer $c = null): Customer
    {
        $digits = preg_replace('/\D/', '', $d['phone']);
        if (strlen($digits) < 7) {
            Shop::fail('Enter a valid phone number.');
        }
        $dup = Customer::where('phone_digits', $digits)->when($c, fn ($q) => $q->where('id', '!=', $c->id))->first();
        if ($dup) {
            Shop::fail("This phone number already belongs to {$dup->name} ({$dup->code}).");
        }
        $d['phone_digits'] = $digits;
        if ($c) {
            $c->update($d);
            Audit::log('customers', 'Customer updated', "{$c->name} ({$c->code})", $c->code);

            return $c;
        }
        $c = Customer::create($d + ['code' => DocNumber::next('customer', 'C-')]);
        Audit::log('customers', 'Customer created', "{$c->name} ({$c->code})", $c->code);

        return $c;
    }

    /** Account payment, applied to the oldest open invoices / delivered repairs first. */
    public static function customerPayment(Customer $c, float $amount, string $method): array
    {
        return DB::transaction(function () use ($c, $amount, $method) {
            $amount = Shop::money($amount);
            $bal = Totals::customerBalance($c->id);
            if ($amount <= 0) {
                Shop::fail('Enter an amount above zero.');
            }
            if ($amount > $bal + 0.001) {
                Shop::fail('Amount exceeds the total outstanding ('.Shop::fmt($bal).').');
            }
            $docs = Sale::where('customer_id', $c->id)->where('status', '!=', 'cancelled')->lockForUpdate()->get()
                ->map(fn ($s) => ['doc' => $s, 'at' => $s->created_at, 'bal' => Totals::sale($s)['balance']])
                ->concat(Repair::where('customer_id', $c->id)->where('status', 'delivered')->lockForUpdate()->get()
                    ->map(fn ($r) => ['doc' => $r, 'at' => $r->received_at, 'bal' => Totals::repair($r)['balance']]))
                ->filter(fn ($x) => $x['bal'] > 0)->sortBy('at');
            $left = $amount;
            $applied = [];
            foreach ($docs as $x) {
                if ($left <= 0) {
                    break;
                }
                $pay = Shop::money(min($x['bal'], $left));
                $x['doc']->payments()->create(['kind' => 'receipt', 'method' => $method, 'amount' => $pay, 'reference' => 'Account payment', 'user_id' => Auth::id()]);
                $applied[] = $x['doc']->no.' '.Shop::fmt($pay);
                $left = Shop::money($left - $pay);
            }
            Audit::log('customers', 'Account payment', "{$c->name} paid ".Shop::fmt($amount)." ($method) → ".implode(', ', $applied), $c->code);

            return $applied;
        });
    }

    public static function saveSupplier(array $d, ?Supplier $s = null): Supplier
    {
        if ($s) {
            $s->update($d);
            Audit::log('suppliers', 'Supplier updated', $s->name, $s->code);

            return $s;
        }
        $s = Supplier::create($d + ['code' => DocNumber::next('supplier', 'S-')]);
        Audit::log('suppliers', 'Supplier created', $s->name, $s->code);

        return $s;
    }

    public static function addExpense(array $d): Expense
    {
        $e = Expense::create($d + ['no' => DocNumber::next('expense', 'EXP-'), 'status' => 'posted', 'user_id' => Auth::id()]);
        Audit::log('expenses', 'Expense recorded', "{$e->no}: {$e->category} ".Shop::fmt($e->amount), $e->no);

        return $e;
    }

    /** Expenses are voided, never deleted, so the ledger stays complete. */
    public static function voidExpense(Expense $e, string $reason): Expense
    {
        if ($e->status === 'void') {
            Shop::fail('This expense is already void.');
        }
        $e->update(['status' => 'void', 'void_reason' => $reason]);
        Audit::log('expenses', 'Expense voided', "{$e->no}: $reason", $e->no);

        return $e;
    }
}
