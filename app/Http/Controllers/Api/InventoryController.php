<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\Purchase;
use App\Models\Repair;
use App\Models\Replacement;
use App\Models\StockAdjustment;
use App\Models\StockMovement;
use App\Models\Warranty;
use App\Services\PurchaseService;
use App\Services\Shop;
use App\Services\StockService;
use App\Services\Totals;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InventoryController extends Controller
{
    /* ---------------- IMEI tracker ---------------- */

    public function devices(Request $request): JsonResponse
    {
        $f = $request->validate(['q' => 'nullable|string|max:60', 'status' => 'nullable|string', 'condition' => 'nullable|string', 'product_id' => 'nullable|integer', 'per_page' => 'nullable|integer|max:500']);
        $rows = Device::with(['product:id,name', 'supplier:id,name', 'customer:id,name', 'sale:id,no', 'warranty'])
            ->when($f['q'] ?? null, function ($q, $v) {
                $k = strtoupper(preg_replace('/[\s-]+/', '', $v));
                $q->where(fn ($w) => $w->where('imei1', 'like', "%$k%")->orWhere('imei2', 'like', "%$k%")->orWhere('serial', 'like', "%$k%")
                    ->orWhereHas('product', fn ($p) => $p->where('name', 'like', "%$v%"))->orWhereHas('sale', fn ($s) => $s->where('no', $v)));
            })
            ->when($f['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($f['condition'] ?? null, fn ($q, $v) => $q->where('condition', $v))
            ->when($f['product_id'] ?? null, fn ($q, $v) => $q->where('product_id', $v))
            ->latest('id')->paginate($f['per_page'] ?? 50);
        if (! (Shop::can('reports', 'manage') || Shop::can('purchases', 'view'))) {
            $rows->getCollection()->each->makeHidden('cost');
        }

        return response()->json($rows);
    }

    /** Full life story of one unit, including warranty-replacement links. */
    public function device(Device $device): JsonResponse
    {
        $codes = array_filter([$device->imei1, $device->imei2, $device->serial]);

        return response()->json([
            'data' => $device->load(['product', 'supplier:id,name', 'customer:id,name,phone', 'sale:id,no,date,user_id', 'events.user:id,name']),
            'purchase' => $device->purchase_id ? Purchase::select('id', 'no', 'date', 'supplier_invoice')->find($device->purchase_id) : null,
            'warranties' => Warranty::where('device_id', $device->id)->orWhereIn('imei', $codes ?: ['-'])->latest('id')->get(),
            'repairs' => Repair::whereIn('imei', $codes ?: ['-'])->orWhereIn('serial', $codes ?: ['-'])->latest('id')->get(),
            'replacement' => $device->replacement_id ? Replacement::find($device->replacement_id) : null,
        ]);
    }

    /* ---------------- Movements & adjustments ---------------- */

    public function movements(Request $request): JsonResponse
    {
        $f = $request->validate(['product_id' => 'nullable|integer', 'type' => 'nullable|string', 'ref' => 'nullable|string', 'from' => 'nullable|date', 'to' => 'nullable|date']);

        return response()->json(StockMovement::with(['product:id,name', 'device:id,imei1,serial', 'user:id,name'])
            ->when($f['product_id'] ?? null, fn ($q, $v) => $q->where('product_id', $v))
            ->when($f['type'] ?? null, fn ($q, $v) => $q->where('type', $v))
            ->when($f['ref'] ?? null, fn ($q, $v) => $q->where('ref', $v))
            ->when($f['from'] ?? null, fn ($q, $v) => $q->where('created_at', '>=', $v))
            ->when($f['to'] ?? null, fn ($q, $v) => $q->where('created_at', '<', date('Y-m-d', strtotime("$v +1 day"))))
            ->latest('id')->paginate(50));
    }

    public function adjustments(): JsonResponse
    {
        return response()->json(['data' => StockAdjustment::with(['product:id,name', 'device:id,imei1,serial', 'requester:id,name', 'approver:id,name'])->latest('id')->limit(500)->get()]);
    }

    public function requestAdjustment(Request $request): JsonResponse
    {
        $d = $request->validate(['product_id' => 'required|exists:products,id', 'device_id' => 'nullable|exists:devices,id', 'qty' => 'nullable|integer', 'type' => 'required|string|max:40', 'reason' => 'required|string|min:3|max:255']);

        return response()->json(['data' => StockService::request($d)], 201);
    }

    public function approveAdjustment(StockAdjustment $adjustment): JsonResponse
    {
        return response()->json(['data' => StockService::approve($adjustment)]);
    }

    public function rejectAdjustment(Request $request, StockAdjustment $adjustment): JsonResponse
    {
        return response()->json(['data' => StockService::reject($adjustment, $request->validate(['note' => 'nullable|string|max:255'])['note'] ?? null)]);
    }

    /* ---------------- Purchases ---------------- */

    public function purchases(Request $request): JsonResponse
    {
        $f = $request->validate(['status' => 'nullable|in:ordered,received,cancelled', 'supplier_id' => 'nullable|integer', 'q' => 'nullable|string|max:60']);
        $rows = Purchase::with('supplier:id,name')->withSum('items as units', 'qty')
            ->when($f['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($f['supplier_id'] ?? null, fn ($q, $v) => $q->where('supplier_id', $v))
            ->when($f['q'] ?? null, fn ($q, $v) => $q->where(fn ($w) => $w->where('no', 'like', "%$v%")->orWhere('supplier_invoice', 'like', "%$v%")))
            ->latest('id')->paginate(50);
        $rows->getCollection()->transform(fn ($p) => $p->toArray() + Totals::purchase($p));

        return response()->json($rows);
    }

    public function purchase(Purchase $purchase): JsonResponse
    {
        $purchase->load(['supplier', 'items.product:id,name,tracking', 'returns', 'payments.user:id,name']);

        return response()->json(['data' => $purchase->toArray() + Totals::purchase($purchase) + [
            'devices' => Device::where('purchase_id', $purchase->id)->get(['id', 'product_id', 'imei1', 'imei2', 'serial', 'status']),
        ]]);
    }

    public function storePurchase(Request $request): JsonResponse
    {
        return response()->json(['data' => PurchaseService::save($this->purchaseData($request))], 201);
    }

    public function receivePurchase(Request $request, Purchase $purchase): JsonResponse
    {
        $d = $this->purchaseData($request);
        $d['status'] = 'received';

        return response()->json(['data' => PurchaseService::save($d, $purchase)]);
    }

    public function cancelPurchase(Request $request, Purchase $purchase): JsonResponse
    {
        return response()->json(['data' => PurchaseService::cancel($purchase, $request->validate(['reason' => 'required|string|min:3|max:255'])['reason'])]);
    }

    public function payPurchase(Request $request, Purchase $purchase): JsonResponse
    {
        $d = $request->validate(['amount' => 'required|numeric|min:0.01', 'method' => 'required|string|max:30', 'note' => 'nullable|string|max:80']);

        return response()->json(['data' => PurchaseService::pay($purchase, (float) $d['amount'], $d['method'], $d['note'] ?? null)], 201);
    }

    public function returnPurchase(Request $request, Purchase $purchase): JsonResponse
    {
        $d = $request->validate(['device_ids' => 'array', 'device_ids.*' => 'integer', 'lines' => 'array', 'lines.*.product_id' => 'required|integer', 'lines.*.qty' => 'required|integer|min:0', 'reason' => 'required|string|min:3|max:255']);

        return response()->json(['data' => PurchaseService::returnToSupplier($purchase, $d['device_ids'] ?? [], $d['lines'] ?? [], $d['reason'])], 201);
    }

    private function purchaseData(Request $request): array
    {
        return $request->validate([
            'supplier_id' => 'required|exists:suppliers,id', 'status' => 'required|in:ordered,received',
            'supplier_invoice' => 'nullable|string|max:60', 'date' => 'nullable|date|before_or_equal:today', 'expected_date' => 'nullable|date',
            'note' => 'nullable|string|max:1000', 'paid' => 'nullable|numeric|min:0', 'method' => 'nullable|string|max:30',
            'items' => 'required|array|min:1', 'items.*.product_id' => 'required|exists:products,id', 'items.*.qty' => 'required|integer|min:1|max:10000',
            'items.*.cost' => 'nullable|numeric|min:0', 'items.*.condition' => 'nullable|in:new,used,refurbished',
            'items.*.units' => 'nullable|array', 'items.*.units.*.imei1' => 'nullable|string|max:20', 'items.*.units.*.imei2' => 'nullable|string|max:20', 'items.*.units.*.serial' => 'nullable|string|max:60',
        ]);
    }
}
