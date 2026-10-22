<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Repair;
use App\Models\RepairPart;
use App\Services\Audit;
use App\Services\RepairService;
use App\Services\Shop;
use App\Services\Totals;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class RepairController extends Controller
{
    /** Without Repairs “Manage”: own jobs, unassigned jobs and jobs the user registered. */
    private function scope(): Builder
    {
        return Repair::query()->when(! Shop::can('repairs', 'manage'), fn ($q) => $q->where(fn ($w) => $w->whereNull('technician_id')->orWhere('technician_id', Auth::id())->orWhere('created_by', Auth::id())));
    }

    private function find(int $id): Repair
    {
        $r = $this->scope()->find($id);
        abort_if(! $r, 404, 'Job not available — it does not exist or is assigned to another technician.');

        return $r;
    }

    public function index(Request $request): JsonResponse
    {
        $f = $request->validate(['q' => 'nullable|string|max:60', 'status' => 'nullable|string', 'technician_id' => 'nullable|integer', 'open' => 'nullable|boolean', 'overdue' => 'nullable|boolean']);
        $rows = $this->scope()->with(['customer:id,name,phone', 'technician:id,name'])
            ->when($f['q'] ?? null, fn ($q, $v) => $q->where(fn ($w) => $w->where('no', 'like', "%$v%")->orWhere('imei', 'like', "%$v%")->orWhere('serial', 'like', "%$v%")->orWhere('model', 'like', "%$v%")->orWhereHas('customer', fn ($c) => $c->where('name', 'like', "%$v%")->orWhere('phone_digits', 'like', '%'.preg_replace('/\D/', '', $v).'%'))))
            ->when($f['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($f['technician_id'] ?? null, fn ($q, $v) => $q->where('technician_id', $v))
            ->when($request->boolean('open'), fn ($q) => $q->whereNotIn('status', ['delivered', 'cancelled']))
            ->when($request->boolean('overdue'), fn ($q) => $q->whereNotIn('status', ['delivered', 'cancelled', 'ready'])->whereDate('expected_date', '<', today()))
            ->latest('id')->paginate(50);
        $rows->getCollection()->transform(fn ($r) => $r->toArray() + ['totals' => Totals::repair($r)]);

        return response()->json($rows);
    }

    public function show(int $id): JsonResponse
    {
        $r = $this->find($id)->load(['customer', 'technician:id,name', 'parts', 'events.user:id,name', 'payments.user:id,name', 'attachments', 'warranty.components', 'device:id,imei1,warranty_id']);
        $data = $r->toArray() + ['totals' => Totals::repair($r), 'follow_ups' => Repair::where('parent_repair_id', $r->id)->get(['id', 'no', 'status'])];
        if (! Shop::can('reports', 'manage')) {
            unset($data['tech_cost'], $data['totals']['cost']);
        }

        return response()->json(['data' => $data]);
    }

    public function store(Request $request): JsonResponse
    {
        $d = $request->validate([
            'customer_id' => 'required|exists:customers,id', 'brand' => 'required|string|max:60', 'model' => 'required|string|max:80', 'color' => 'nullable|string|max:40',
            'imei' => 'nullable|string|max:20', 'serial' => 'nullable|string|max:60', 'condition' => 'nullable|string|max:1000', 'accessories' => 'nullable|array',
            'problem' => 'required|string|min:4|max:2000', 'existing_damage' => 'nullable|string|max:255', 'type' => 'nullable|string|max:60', 'priority' => 'nullable|in:Normal,High,Urgent',
            'estimate' => 'nullable|numeric|min:0', 'estimate_approved' => 'boolean', 'expected_date' => 'nullable|date|after_or_equal:today',
            'technician_id' => 'nullable|exists:users,id', 'advance' => 'nullable|numeric|min:0', 'advance_method' => 'nullable|string|max:30', 'terms_accepted' => 'accepted',
        ], ['terms_accepted.accepted' => 'Customer must accept the repair terms before the job is created.']);

        return response()->json(['data' => RepairService::create($d)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['diagnosis' => 'nullable|string|max:3000', 'notes' => 'nullable|string|max:3000', 'technician_id' => 'nullable|exists:users,id',
            'expected_date' => 'nullable|date', 'estimate' => 'nullable|numeric|min:0', 'type' => 'nullable|string|max:60', 'priority' => 'nullable|in:Normal,High,Urgent',
            'labor' => 'nullable|numeric|min:0', 'labor_covered' => 'boolean', 'tech_cost' => 'nullable|numeric|min:0', 'discount' => 'nullable|numeric|min:0']);

        return response()->json(['data' => RepairService::update($this->find($id), $d)]);
    }

    public function status(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['status' => 'required|in:'.implode(',', array_keys(RepairService::STATUSES)), 'note' => 'nullable|string|max:255']);

        return response()->json(['data' => RepairService::setStatus($this->find($id), $d['status'], $d['note'] ?? null)]);
    }

    public function approval(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['approved' => 'required|boolean', 'note' => 'nullable|string|max:255', 'amount' => 'nullable|numeric|min:0']);

        return response()->json(['data' => RepairService::approval($this->find($id), $d['approved'], $d['note'] ?? null, isset($d['amount']) ? (float) $d['amount'] : null)]);
    }

    public function addPart(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['product_id' => 'required|exists:products,id', 'qty' => 'required|integer|min:1', 'price' => 'nullable|numeric|min:0', 'covered' => 'boolean']);

        return response()->json(['data' => RepairService::addPart($this->find($id), $d['product_id'], $d['qty'], isset($d['price']) ? (float) $d['price'] : null, (bool) ($d['covered'] ?? false))], 201);
    }

    public function removePart(int $id, RepairPart $part): JsonResponse
    {
        RepairService::removePart($this->find($id), $part);

        return response()->json(['message' => 'Part returned to stock.']);
    }

    public function pay(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['amount' => 'required|numeric|min:0.01', 'method' => 'required|string|max:30']);

        return response()->json(['data' => RepairService::pay($this->find($id), $d['method'], (float) $d['amount'])], 201);
    }

    public function deliver(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['collected_by' => 'required|string|max:120', 'confirm' => 'accepted', 'signature' => 'nullable|string|max:400000',
            'payment' => 'nullable|numeric|min:0', 'method' => 'nullable|string|max:30', 'credit' => 'boolean', 'labor_days' => 'nullable|integer|min:0|max:730',
            'part_days' => 'nullable|array', 'part_days.*' => 'nullable|integer|min:0|max:730'], ['confirm.accepted' => 'Customer confirmation of device condition is required.']);

        return response()->json(['data' => RepairService::deliver($this->find($id), $d)->load('warranty.components')]);
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        return response()->json(['data' => RepairService::cancel($this->find($id), $request->validate(['reason' => 'required|string|min:3|max:255'])['reason'])]);
    }

    public function photo(Request $request, int $id): JsonResponse
    {
        $r = $this->find($id);
        $file = $request->validate(['photo' => 'required|image|max:6144'])['photo'];
        $att = $r->attachments()->create(['kind' => 'photo', 'path' => $file->store("repairs/{$r->no}", 'local'), 'original_name' => $file->getClientOriginalName(), 'user_id' => Auth::id()]);
        Audit::log('repairs', 'Photo added', $r->no, $r->no);

        return response()->json(['data' => $att], 201);
    }
}
