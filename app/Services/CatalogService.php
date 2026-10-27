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
    public static function saveProduct(array $d, ?Product $p = null): Product
    {
        return DB::transaction(function () use ($d, $p) {
            if ($p) {
                $hasMoves = StockMovement::where('product_id', $p->id)->exists();
                if ($hasMoves && isset($d['tracking']) && $d['tracking'] !== $p->tracking) {
                    Shop::fail('Tracking type cannot be changed after stock movements exist.');
                }
                $changes = [];
                if (isset($d['price']) && (float) $d['price'] !== $p->price) {
                    $changes[] = 'price '.Shop::fmt($p->price).' → '.Shop::fmt($d['price']);
                }
                if (isset($d['cost']) && (float) $d['cost'] !== $p->cost) {
                    $changes[] = 'cost '.Shop::fmt($p->cost).' → '.Shop::fmt($d['cost']);
                }
                if (isset($d['warranty_months']) && (int) $d['warranty_months'] !== $p->warranty_months) {
                    $changes[] = "warranty {$p->warranty_months}m → {$d['warranty_months']}m";
                }
                unset($d['qty']); // stock only changes through movements
                $p->update($d);
                Audit::log('products', 'Product updated', $p->name.($changes ? ' — '.implode(', ', $changes) : ''), $p->code);

                return $p;
            }
            $d['code'] = $d['code'] ?? null ?: DocNumber::next('product', 'P-');
            $p = Product::create(collect($d)->except('qty')->all() + ['qty' => 0]);
            Audit::log('products', 'Product created', "{$p->name} ({$p->code})", $p->code);

            return $p;
        });
    }

    /** Products with history are deactivated, never deleted. */
    public static function deleteProduct(Product $p): string
    {
        if (StockMovement::where('product_id', $p->id)->exists()) {
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
