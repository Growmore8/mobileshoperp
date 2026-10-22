<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Claim;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\Replacement;
use App\Models\Warranty;
use App\Services\CatalogService;
use App\Services\WarrantyService;
use App\Support\Imei;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class WarrantyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $f = $request->validate(['kind' => 'nullable|in:product,repair', 'state' => 'nullable|in:active,expiring,expired,void,replaced', 'q' => 'nullable|string|max:60', 'expires_within' => 'nullable|integer|min:1|max:365']);
        $days = (int) \App\Services\Shop::setting('expiring_days', 30);
        $today = Carbon::today();
        $rows = Warranty::with(['customer:id,name', 'product:id,name', 'components'])
            ->when($f['kind'] ?? null, fn ($q, $v) => $q->where('kind', $v))
            ->when($f['q'] ?? null, fn ($q, $v) => $q->where(fn ($w) => $w->where('no', 'like', "%$v%")->orWhere('imei', 'like', '%'.Imei::normalize($v).'%')->orWhere('serial', 'like', '%'.Imei::normalize($v).'%')->orWhere('invoice_no', $v)->orWhere('job_no', $v)))
            ->when($f['expires_within'] ?? null, fn ($q, $v) => $q->where('status', 'active')->whereBetween('end_date', [$today, $today->copy()->addDays($v)]))
            ->when($f['state'] ?? null, function ($q, $v) use ($today, $days) {
                match ($v) {
                    'void', 'replaced' => $q->where('status', $v),
                    'expired' => $q->where('status', 'active')->whereDate('end_date', '<', $today),
                    'expiring' => $q->where('status', 'active')->whereBetween('end_date', [$today, $today->copy()->addDays($days)]),
                    'active' => $q->where('status', 'active')->whereDate('end_date', '>', $today->copy()->addDays($days)),
                };
            })
            ->latest('id')->paginate(50);

        return response()->json($rows);
    }

    /** Warranty check by IMEI, serial, invoice no., job no., warranty no. or customer phone. */
    public function lookup(Request $request): JsonResponse
    {
        $q = trim($request->validate(['q' => 'required|string|min:3|max:60'])['q']);
        $k = Imei::normalize($q);
        $digits = preg_replace('/\D/', '', $q);
        $custIds = strlen($digits) >= 7 ? Customer::where('phone_digits', 'like', "%$digits%")->pluck('id') : collect();
        $rows = Warranty::with(['customer:id,name,phone', 'product:id,name', 'components'])
            ->where(fn ($w) => $w->whereIn('no', [$q, $k])->orWhere('imei', $k)->orWhere('serial', $k)->orWhere('invoice_no', $q)->orWhere('job_no', $q)->orWhereIn('customer_id', $custIds))
            ->latest('id')->limit(30)->get()
            ->map(fn ($w) => $w->toArray() + ['eligibility' => WarrantyService::eligibility($w)]);

        return response()->json(['data' => $rows]);
    }

    public function show(Warranty $warranty): JsonResponse
    {
        $warranty->load(['customer', 'product', 'device', 'components', 'events.user:id,name', 'claims']);

        return response()->json(['data' => $warranty->toArray() + [
            'eligibility' => WarrantyService::eligibility($warranty),
            'replacement' => $warranty->replacement_id ? Replacement::find($warranty->replacement_id) : null,
            'related' => $warranty->imei ? Warranty::where('imei', $warranty->imei)->where('id', '!=', $warranty->id)->get(['id', 'no', 'kind', 'status', 'end_date']) : [],
        ]]);
    }

    public function extend(Request $request, Warranty $warranty): JsonResponse
    {
        $d = $request->validate(['months' => 'nullable|integer|min:1|max:60', 'days' => 'nullable|integer|min:1|max:730', 'reason' => 'required|string|min:3|max:255']);

        return response()->json(['data' => WarrantyService::extend($warranty, $d['months'] ?? null, $d['days'] ?? null, $d['reason'])]);
    }

    /* ---------------- Claims ---------------- */

    public function claims(Request $request): JsonResponse
    {
        $f = $request->validate(['status' => 'nullable|string', 'kind' => 'nullable|in:product,repair', 'open' => 'nullable|boolean']);

        return response()->json(Claim::with(['warranty:id,no,imei,serial,product_id,device_label', 'customer:id,name', 'assignee:id,name'])
            ->when($f['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($f['kind'] ?? null, fn ($q, $v) => $q->where('kind', $v))
            ->when($request->boolean('open'), fn ($q) => $q->whereIn('status', ['pending', 'inspection']))
            ->latest('id')->paginate(50));
    }

    public function claim(Claim $claim): JsonResponse
    {
        $claim->load(['warranty.components', 'warranty.device', 'customer', 'assignee:id,name', 'repair:id,no,status', 'events.user:id,name', 'attachments']);

        return response()->json(['data' => $claim->toArray() + [
            'eligibility_now' => WarrantyService::eligibility($claim->warranty, $claim->flags ?? []),
            'replacement' => $claim->replacement_id ? Replacement::find($claim->replacement_id) : null,
        ]]);
    }

    public function storeClaim(Request $request): JsonResponse
    {
        $d = $request->validate(['warranty_id' => 'required|exists:warranties,id', 'fault' => 'required|string|min:4|max:2000', 'notes' => 'nullable|string|max:1000',
            'flags' => 'nullable|array', 'flags.physical' => 'boolean', 'flags.liquid' => 'boolean', 'flags.tampered' => 'boolean', 'flags.unrelated' => 'boolean']);

        return response()->json(['data' => WarrantyService::createClaim($d)], 201);
    }

    public function updateClaim(Request $request, Claim $claim): JsonResponse
    {
        $d = $request->validate(['status' => 'nullable|in:inspection,approved,rejected,resolved', 'assigned_to' => 'nullable|exists:users,id', 'findings' => 'nullable|string|max:2000',
            'decision_note' => 'nullable|string|max:255', 'resolution' => 'nullable|in:repair,replacement,refund,other', 'resolution_note' => 'nullable|string|max:255',
            'cost' => 'nullable|numeric|min:0', 'override' => 'boolean', 'flags' => 'nullable|array']);

        return response()->json(['data' => WarrantyService::updateClaim($claim, array_filter($d, fn ($v) => $v !== null))]);
    }

    public function claimPhoto(Request $request, Claim $claim): JsonResponse
    {
        $file = $request->validate(['photo' => 'required|image|max:6144'])['photo'];
        $att = $claim->attachments()->create(['kind' => 'photo', 'path' => $file->store("claims/{$claim->no}", 'local'), 'original_name' => $file->getClientOriginalName(), 'user_id' => $request->user()->id]);

        return response()->json(['data' => $att], 201);
    }

    public function claimRepair(Claim $claim): JsonResponse
    {
        return response()->json(['data' => WarrantyService::claimToRepair($claim)], 201);
    }

    public function replace(Request $request, Claim $claim): JsonResponse
    {
        $d = $request->validate([
            'new_device_id' => 'required|integer', 'mode' => 'required|in:remaining,months,date', 'note' => 'nullable|string|max:255',
            'months' => 'required_if:mode,months|nullable|integer|min:1|max:120', 'end_date' => 'required_if:mode,date|nullable|date|after_or_equal:today',
        ], ['mode.required' => 'Choose the warranty period for the replacement unit.', 'months.required_if' => 'Enter the warranty period in months.', 'end_date.required_if' => 'Choose the warranty end date.']);

        return response()->json(['data' => WarrantyService::replace($claim, $d['new_device_id'], $d['mode'], $d['note'] ?? null, isset($d['months']) ? (int) $d['months'] : null, $d['end_date'] ?? null)->load(['oldDevice', 'newDevice', 'newWarranty'])], 201);
    }

    /* ---------------- Expenses ---------------- */

    public function expenses(Request $request): JsonResponse
    {
        $f = $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date', 'category' => 'nullable|string']);

        return response()->json(['data' => Expense::with('user:id,name')
            ->when($f['from'] ?? null, fn ($q, $v) => $q->whereDate('date', '>=', $v))
            ->when($f['to'] ?? null, fn ($q, $v) => $q->whereDate('date', '<=', $v))
            ->when($f['category'] ?? null, fn ($q, $v) => $q->where('category', $v))
            ->latest('date')->latest('id')->limit(1000)->get()]);
    }

    public function storeExpense(Request $request): JsonResponse
    {
        $d = $request->validate(['date' => 'required|date|before_or_equal:today', 'category' => 'required|string|max:60', 'amount' => 'required|numeric|min:0.01', 'method' => 'required|string|max:30', 'note' => 'nullable|string|max:255']);

        return response()->json(['data' => CatalogService::addExpense($d)], 201);
    }

    public function voidExpense(Request $request, Expense $expense): JsonResponse
    {
        return response()->json(['data' => CatalogService::voidExpense($expense, $request->validate(['reason' => 'required|string|min:3|max:255'])['reason'])]);
    }
}
