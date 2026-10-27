<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Quotation;
use App\Models\Replacement;
use App\Models\Sale;
use App\Services\SaleService;
use App\Services\Shop;
use App\Services\Totals;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class SaleController extends Controller
{
    /** Staff without Sales “Manage” only see their own invoices. */
    private function scope(): Builder
    {
        return Sale::query()->when(! Shop::can('sales', 'manage'), fn ($q) => $q->where('user_id', Auth::id()));
    }

    public function index(Request $request): JsonResponse
    {
        $f = $request->validate(['q' => 'nullable|string|max:60', 'status' => 'nullable|string', 'from' => 'nullable|date', 'to' => 'nullable|date', 'user_id' => 'nullable|integer', 'customer_id' => 'nullable|integer']);
        $rows = $this->scope()->with(['customer:id,name', 'user:id,name', 'items:id,sale_id,name,code,qty'])
            ->when($f['q'] ?? null, fn ($q, $v) => $q->where(fn ($w) => $w->where('no', 'like', "%$v%")->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%$v%"))->orWhereHas('items', fn ($i) => $i->where('code', 'like', "%$v%")->orWhere('name', 'like', "%$v%"))))
            ->when($f['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($f['from'] ?? null, fn ($q, $v) => $q->whereDate('date', '>=', $v))
            ->when($f['to'] ?? null, fn ($q, $v) => $q->whereDate('date', '<=', $v))
            ->when($f['user_id'] ?? null, fn ($q, $v) => $q->where('user_id', $v))
            ->when($f['customer_id'] ?? null, fn ($q, $v) => $q->where('customer_id', $v))
            ->latest('id')->paginate(50);
        $rows->getCollection()->transform(fn ($s) => $s->toArray() + Totals::sale($s));

        return response()->json($rows);
    }

    public function show(int $id): JsonResponse
    {
        $s = $this->scope()->with(['customer', 'user:id,name', 'items.warranty', 'returns.user:id,name', 'payments.user:id,name'])->find($id);
        if (! $s) {
            return response()->json(['message' => 'Invoice not available — it does not exist or belongs to another staff member.'], 404);
        }
        $data = $s->toArray() + Totals::sale($s) + ['replacements' => Replacement::where('sale_id', $s->id)->get()];
        if (! Shop::can('reports', 'manage')) {
            foreach ($data['items'] as &$i) {
                unset($i['cost']);
            }
        }

        return response()->json(['data' => $data]);
    }

    public function store(Request $request): JsonResponse
    {
        $d = $request->validate([
            'customer_id' => 'nullable|exists:customers,id', 'discount' => 'nullable|numeric|min:0', 'discount_percent' => 'nullable|numeric|min:0|max:100', 'note' => 'nullable|string|max:500', 'allow_credit' => 'boolean',
            'items' => 'required|array|min:1', 'items.*.product_id' => 'required|integer', 'items.*.device_id' => 'nullable|integer',
            'items.*.qty' => 'required|integer|min:1', 'items.*.price' => 'nullable|numeric|min:0', 'items.*.discount' => 'nullable|numeric|min:0', 'items.*.warranty_months' => 'nullable|integer|min:0|max:60',
            'payments' => 'array', 'payments.*.method' => 'required|string|max:30', 'payments.*.amount' => 'required|numeric|min:0', 'payments.*.reference' => 'nullable|string|max:80',
        ]);
        $sale = SaleService::create($d);

        return response()->json(['data' => $sale->load(['items.warranty', 'payments']) ->toArray() + Totals::sale($sale)], 201);
    }

    public function pay(Request $request, Sale $sale): JsonResponse
    {
        $d = $request->validate(['amount' => 'required|numeric|min:0.01', 'method' => 'required|string|max:30', 'reference' => 'nullable|string|max:80']);

        return response()->json(['data' => SaleService::pay($sale, $d['method'], (float) $d['amount'], $d['reference'] ?? null)], 201);
    }

    public function refund(Request $request, Sale $sale): JsonResponse
    {
        $d = $request->validate(['lines' => 'required|array|min:1', 'lines.*.item_id' => 'required|integer', 'lines.*.qty' => 'required|integer|min:0', 'reason' => 'required|string|max:255', 'restock' => 'required|in:stock,inspect,damaged', 'method' => 'required|string|max:30']);

        return response()->json(['data' => SaleService::refund($sale, $d['lines'], $d['reason'], $d['restock'], $d['method'])], 201);
    }

    public function cancel(Request $request, Sale $sale): JsonResponse
    {
        return response()->json(['data' => SaleService::cancel($sale, $request->validate(['reason' => 'required|string|max:255'])['reason'])]);
    }

    /* ---------------- Quotations ---------------- */

    public function quotations(): JsonResponse
    {
        return response()->json(['data' => Quotation::with(['customer:id,name', 'items'])->latest('id')->limit(200)->get()]);
    }

    public function storeQuotation(Request $request): JsonResponse
    {
        $d = $request->validate(['customer_id' => 'nullable|exists:customers,id', 'discount' => 'nullable|numeric|min:0', 'discount_percent' => 'nullable|numeric|min:0|max:100', 'note' => 'nullable|string|max:500',
            'items' => 'required|array|min:1', 'items.*.product_id' => 'required|exists:products,id', 'items.*.qty' => 'required|integer|min:1', 'items.*.price' => 'required|numeric|min:0', 'items.*.discount' => 'nullable|numeric|min:0']);

        return response()->json(['data' => SaleService::quote($d)->load('items')], 201);
    }
}
