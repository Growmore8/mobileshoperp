<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Repair;
use App\Models\Sale;
use App\Models\Supplier;
use App\Models\Warranty;
use App\Services\CatalogService;
use App\Services\Inventory;
use App\Services\Shop;
use App\Services\Totals;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CatalogController extends Controller
{
    /* ---------------- Categories & products ---------------- */

    public function categories(): JsonResponse
    {
        return response()->json(['data' => Category::orderBy('id')->get()]);
    }

    public function updateCategory(Request $request, Category $category): JsonResponse
    {
        $d = $request->validate(['warranty_months' => 'required|integer|min:0|max:120']);
        $old = $category->warranty_months;
        $category->update($d);
        \App\Services\Audit::log('settings', 'Category warranty changed', "{$category->name}: {$old}m → {$d['warranty_months']}m");

        return response()->json(['data' => $category]);
    }

    public function products(Request $request): JsonResponse
    {
        $f = $request->validate(['q' => 'nullable|string|max:100', 'category_id' => 'nullable|integer', 'tracking' => 'nullable|in:qty,imei,serial', 'active' => 'nullable|boolean', 'stock' => 'nullable|in:low,out,ok']);
        $inStock = Device::where('status', 'in_stock')->selectRaw('product_id, count(*) n')->groupBy('product_id')->pluck('n', 'product_id');
        $showCost = Shop::can('reports', 'manage') || Shop::can('purchases', 'view');

        $rows = Product::query()
            ->when($f['q'] ?? null, fn ($q, $v) => $q->where(fn ($w) => $w->where('name', 'like', "%$v%")->orWhere('sku', 'like', "%$v%")->orWhere('barcode', $v)->orWhere('brand', 'like', "%$v%")->orWhere('code', $v)))
            ->when($f['category_id'] ?? null, fn ($q, $v) => $q->where('category_id', $v))
            ->when($f['tracking'] ?? null, fn ($q, $v) => $q->where('tracking', $v))
            ->when(isset($f['active']), fn ($q) => $q->where('active', (bool) $f['active']))
            ->orderBy('name')->get()
            ->map(function (Product $p) use ($inStock, $showCost) {
                $stock = $p->tracking === 'qty' ? (int) $p->qty : (int) ($inStock[$p->id] ?? 0);
                $row = $p->toArray() + ['stock' => $stock, 'stock_state' => $stock <= 0 ? 'out' : ($stock <= $p->min_stock ? 'low' : 'ok')];
                if (! $showCost) {
                    unset($row['cost']); // cost prices are financial data
                }

                return $row;
            })
            ->when($f['stock'] ?? null, fn ($c, $v) => $c->where('stock_state', $v)->values());

        return response()->json(['data' => $rows]);
    }

    public function storeProduct(Request $request): JsonResponse
    {
        return response()->json(['data' => CatalogService::saveProduct($this->productData($request))], 201);
    }

    public function updateProduct(Request $request, Product $product): JsonResponse
    {
        return response()->json(['data' => CatalogService::saveProduct($this->productData($request, $product), $product)]);
    }

    public function destroyProduct(Product $product): JsonResponse
    {
        return response()->json(['result' => CatalogService::deleteProduct($product)]);
    }

    private function productData(Request $request, ?Product $p = null): array
    {
        $data = $request->validate([
            'name' => 'required|string|max:160',
            'code' => ['nullable', 'string', 'max:20', Rule::unique('products')->ignore($p?->id)],
            'category_id' => 'required|exists:categories,id',
            'brand' => 'nullable|string|max:80', 'model' => 'nullable|string|max:80', 'variant' => 'nullable|string|max:80',
            'color' => 'nullable|string|max:60', 'storage' => 'nullable|string|max:20', 'ram' => 'nullable|string|max:20',
            'cost' => 'sometimes|numeric|min:0', 'price' => 'required|numeric|min:0', 'wholesale' => 'nullable|numeric|min:0',
            'sku' => ['nullable', 'string', 'max:60', Rule::unique('products')->ignore($p?->id)],
            'barcode' => ['nullable', 'string', 'max:60', Rule::unique('products')->ignore($p?->id)],
            'tracking' => 'required|in:qty,imei,serial', 'condition' => 'nullable|in:new,used,refurbished',
            'min_stock' => 'nullable|integer|min:0', 'warranty_months' => 'nullable|integer|min:0|max:120',
            'warranty_provider' => 'nullable|in:Manufacturer,Distributor,Shop', 'used_warranty_months' => 'nullable|integer|min:0|max:120',
            'repair_warranty_days' => 'nullable|integer|min:0|max:730', 'taxable' => 'boolean', 'discountable' => 'boolean', 'active' => 'boolean',
            'supplier_id' => 'nullable|exists:suppliers,id', 'description' => 'nullable|string|max:2000',
        ]);
        if (! (Shop::can('reports', 'manage') || Shop::can('purchases', 'view'))) {
            unset($data['cost']); // users who cannot see costs cannot set them
        }

        return array_map(fn ($v) => $v === null ? null : $v, $data);
    }

    /** Upload or remove (image = null) a product photo. Product photos are public catalogue images. */
    public function productImage(Request $request, Product $product): JsonResponse
    {
        $request->validate(['image' => 'nullable|image|max:4096']);
        if ($product->image) {
            \Illuminate\Support\Facades\Storage::disk('public')->delete($product->image);
        }
        $path = $request->file('image')?->store('products', 'public');
        $product->update(['image' => $path]);
        \App\Services\Audit::log('products', $path ? 'Product photo updated' : 'Product photo removed', $product->name, $product->code);

        return response()->json(['data' => ['image' => $path ? \Illuminate\Support\Facades\Storage::disk('public')->url($path) : '']]);
    }

    /* ---------------- Customers ---------------- */

    public function customers(Request $request): JsonResponse
    {
        $q = $request->query('q');
        $rows = Customer::query()
            ->when($q, fn ($b) => $b->where(fn ($w) => $w->where('name', 'like', "%$q%")->orWhere('phone_digits', 'like', '%'.preg_replace('/\D/', '', $q).'%')->orWhere('code', $q)->orWhere('email', 'like', "%$q%")))
            ->orderBy('name')->get();
        if (Shop::can('sales', 'view')) {
            $rows->each(fn ($c) => $c->setAttribute('balance', Totals::customerBalance($c->id)));
            if ($request->boolean('owing')) {
                $rows = $rows->filter(fn ($c) => $c->balance > 0)->values();
            }
        }

        return response()->json(['data' => $rows]);
    }

    public function customer(Customer $customer): JsonResponse
    {
        $showMoney = Shop::can('sales', 'view');

        return response()->json(['data' => $customer, 'related' => [
            'sales' => $showMoney ? Sale::where('customer_id', $customer->id)->latest('id')->get()->map(fn ($s) => $s->toArray() + Totals::sale($s)) : [],
            'devices' => Device::with('product:id,name')->where('customer_id', $customer->id)->get(),
            'warranties' => Warranty::where('customer_id', $customer->id)->latest('id')->get(),
            'repairs' => Repair::where('customer_id', $customer->id)->latest('id')->get(),
            'claims' => \App\Models\Claim::where('customer_id', $customer->id)->latest('id')->get(),
            'balance' => $showMoney ? Totals::customerBalance($customer->id) : null,
        ]]);
    }

    public function storeCustomer(Request $request): JsonResponse
    {
        return response()->json(['data' => CatalogService::saveCustomer($this->customerData($request))], 201);
    }

    public function updateCustomer(Request $request, Customer $customer): JsonResponse
    {
        return response()->json(['data' => CatalogService::saveCustomer($this->customerData($request), $customer)]);
    }

    public function customerPayment(Request $request, Customer $customer): JsonResponse
    {
        $d = $request->validate(['amount' => 'required|numeric|min:0.01', 'method' => 'required|string|max:30']);

        return response()->json(['applied' => CatalogService::customerPayment($customer, (float) $d['amount'], $d['method'])]);
    }

    private function customerData(Request $request): array
    {
        return $request->validate([
            'name' => 'required|string|max:120', 'phone' => ['required', 'string', 'max:40', 'regex:/^[+\d][\d\s-]{6,}$/'],
            'email' => 'nullable|email|max:120', 'address' => 'nullable|string|max:255', 'notes' => 'nullable|string|max:2000',
        ], ['phone.regex' => 'Enter a valid phone number.']);
    }

    /* ---------------- Suppliers ---------------- */

    public function suppliers(): JsonResponse
    {
        $showMoney = Shop::can('purchases', 'view');
        $rows = Supplier::orderBy('name')->get()->each(function ($s) use ($showMoney) {
            if ($showMoney) {
                $s->setAttribute('balance', Totals::supplierBalance($s->id));
                $s->setAttribute('total_purchased', (float) Purchase::where('supplier_id', $s->id)->where('status', 'received')->sum('total'));
            }
        });

        return response()->json(['data' => $rows]);
    }

    public function storeSupplier(Request $request): JsonResponse
    {
        return response()->json(['data' => CatalogService::saveSupplier($this->supplierData($request))], 201);
    }

    public function updateSupplier(Request $request, Supplier $supplier): JsonResponse
    {
        return response()->json(['data' => CatalogService::saveSupplier($this->supplierData($request), $supplier)]);
    }

    private function supplierData(Request $request): array
    {
        return $request->validate([
            'name' => 'required|string|max:160', 'contact' => 'nullable|string|max:120', 'phone' => 'nullable|string|max:40',
            'email' => 'nullable|email|max:120', 'address' => 'nullable|string|max:255', 'terms' => 'nullable|string|max:80', 'active' => 'boolean',
        ]);
    }

    /* ---------------- Device look-up (IMEI tracker, POS scan) ---------------- */

    public function lookupDevice(Request $request): JsonResponse
    {
        $d = Inventory::findDevice($request->validate(['code' => 'required|string|max:60'])['code']);
        if (! $d) {
            return response()->json(['message' => 'No unit with that IMEI / serial.'], 404);
        }

        return response()->json(['data' => $d->load('product:id,name,price,tracking')]);
    }
}
