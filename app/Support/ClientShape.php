<?php

namespace App\Support;

use App\Models\ActivityLog;
use App\Models\Category;
use App\Models\Claim;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Expense;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Quotation;
use App\Models\Repair;
use App\Models\Replacement;
use App\Models\Role;
use App\Models\Sale;
use App\Models\StockAdjustment;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;
use App\Models\Warranty;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

/**
 * Converts database records into the exact shape the approved UI works with
 * (camelCase keys, string ids, nested items/payments/history).
 * Cost fields are removed for users who may not see financial data.
 */
final class ClientShape
{
    /** Optional preloaded replacements keyed by sale id (avoids one query per invoice). */
    public ?\Illuminate\Support\Collection $replacementsBySale = null;

    public function __construct(private readonly bool $showCost) {}

    private static function id(mixed $v): ?string
    {
        return $v === null ? null : (string) $v;
    }

    private static function ts(mixed $v): ?string
    {
        return $v ? Carbon::parse($v)->toIso8601ZuluString('millisecond') : null;
    }

    private static function day(mixed $v): ?string
    {
        return $v ? Carbon::parse($v)->toDateString() : null;
    }

    private function cost(array $row, string ...$keys): array
    {
        if (! $this->showCost) {
            foreach ($keys as $k) {
                unset($row[$k]);
            }
        }

        return $row;
    }

    public static function settings(array $s): array
    {
        $n = $s['notify'] ?? [];
        $terms = $s['terms'] ?? [];

        return [
            'shopName' => $s['shop_name'] ?? '', 'tagline' => $s['tagline'] ?? '', 'address' => $s['address'] ?? '', 'phone' => $s['phone'] ?? '',
            'email' => $s['email'] ?? '', 'taxId' => $s['tax_id'] ?? '', 'currency' => $s['currency'] ?? 'Rs.', 'taxName' => $s['tax_name'] ?? 'Tax',
            'taxRate' => (float) ($s['tax_rate'] ?? 0), 'taxInclusive' => (bool) ($s['tax_inclusive'] ?? true), 'invoicePrefix' => $s['invoice_prefix'] ?? 'INV-',
            'invoiceFooter' => $s['invoice_footer'] ?? '', 'costing' => $s['costing'] ?? '', 'warrantyStart' => $s['warranty_start'] ?? 'sale',
            'repairWarrantyStart' => $s['repair_warranty_start'] ?? 'delivery', 'expiringDays' => (int) ($s['expiring_days'] ?? 30),
            'requireSignature' => (bool) ($s['require_signature'] ?? true), 'paymentMethods' => $s['payment_methods'] ?? ['Cash'],
            'expenseCategories' => $s['expense_categories'] ?? ['Other'],
            'repairTypes' => array_map(fn ($t) => ['name' => $t['name'], 'laborDays' => (int) $t['labor_days']], $s['repair_types'] ?? []),
            'terms' => ['product' => $terms['product'] ?? '', 'used' => $terms['used'] ?? '', 'repair' => $terms['repair'] ?? ''],
            'notify' => [
                'lowStock' => (bool) ($n['low_stock'] ?? true), 'overdueRepairs' => (bool) ($n['overdue_repairs'] ?? true),
                'readyForCollection' => (bool) ($n['ready_for_collection'] ?? true), 'warrantyExpiry' => (bool) ($n['warranty_expiry'] ?? true),
                'pendingClaims' => (bool) ($n['pending_claims'] ?? true), 'receivables' => (bool) ($n['receivables'] ?? true),
            ],
            'channels' => $s['channels'] ?? ['sms' => false, 'email' => false, 'whatsapp' => false],
        ];
    }

    public function role(Role $r): array
    {
        return ['id' => self::id($r->id), 'name' => $r->name, 'description' => $r->description, 'isAdmin' => $r->is_admin, 'perms' => (object) ($r->permissions ?? [])];
    }

    public function user(User $u, bool $full): array
    {
        $row = ['id' => self::id($u->id), 'name' => $u->name, 'username' => $u->username, 'roleId' => self::id($u->role_id), 'active' => $u->active];

        return $full ? $row + ['phone' => $u->phone, 'email' => $u->email, 'lastLogin' => self::ts($u->last_login_at), 'createdAt' => self::ts($u->created_at)] : $row;
    }

    public function category(Category $c): array
    {
        return ['id' => self::id($c->id), 'kind' => $c->kind, 'name' => $c->name, 'warrantyMonths' => $c->warranty_months, 'color' => $c->color];
    }

    public function supplier(Supplier $s): array
    {
        return ['id' => self::id($s->id), 'code' => $s->code, 'name' => $s->name, 'contact' => $s->contact, 'phone' => $s->phone, 'email' => $s->email,
            'address' => $s->address, 'terms' => $s->terms, 'active' => $s->active, 'createdAt' => self::ts($s->created_at)];
    }

    public function customer(Customer $c): array
    {
        return ['id' => self::id($c->id), 'code' => $c->code, 'name' => $c->name, 'phone' => $c->phone, 'email' => $c->email,
            'address' => $c->address, 'notes' => $c->notes, 'createdAt' => self::ts($c->created_at)];
    }

    public function product(Product $p): array
    {
        return $this->cost([
            'id' => self::id($p->id), 'code' => $p->code, 'name' => $p->name, 'categoryId' => self::id($p->category_id), 'brand' => $p->brand,
            'model' => $p->model, 'variant' => $p->variant, 'color' => $p->color, 'storage' => $p->storage, 'ram' => $p->ram,
            'cost' => $p->cost, 'price' => $p->price, 'wholesale' => $p->wholesale, 'sku' => $p->sku, 'barcode' => $p->barcode,
            'serialized' => $p->tracking !== 'qty', 'idType' => $p->tracking === 'qty' ? '' : $p->tracking, 'condition' => $p->condition,
            'minStock' => $p->min_stock, 'qty' => $p->qty, 'warrantyMonths' => $p->warranty_months, 'warrantyProvider' => $p->warranty_provider,
            'usedWarrantyMonths' => $p->used_warranty_months, 'repairWarrantyDays' => $p->repair_warranty_days, 'taxable' => $p->taxable,
            'discountable' => $p->discountable, 'active' => $p->active, 'supplierId' => self::id($p->supplier_id), 'description' => $p->description,
            'image' => $p->image ? Storage::disk('public')->url($p->image) : '', 'createdAt' => self::ts($p->created_at),
        ], 'cost');
    }

    public function device(Device $d): array
    {
        return $this->cost([
            'id' => self::id($d->id), 'productId' => self::id($d->product_id), 'imei1' => $d->imei1 ?? '', 'imei2' => $d->imei2 ?? '', 'serial' => $d->serial ?? '',
            'condition' => $d->condition, 'status' => $d->status, 'cost' => $d->cost, 'location' => $d->location, 'supplierId' => self::id($d->supplier_id),
            'purchaseId' => self::id($d->purchase_id), 'customerId' => self::id($d->customer_id), 'saleId' => self::id($d->sale_id), 'soldAt' => self::ts($d->sold_at),
            'warrantyId' => self::id($d->warranty_id), 'replacedById' => self::id($d->replaced_by_device_id), 'replacementOfId' => self::id($d->replacement_of_device_id),
            'replacementNo' => $d->replacement_id ? Replacement::whereKey($d->replacement_id)->value('no') : null, 'createdAt' => self::ts($d->created_at),
            'history' => $d->events->map(fn ($e) => ['at' => self::ts($e->created_at), 'userId' => self::id($e->user_id), 'type' => $e->type, 'ref' => $e->ref ?? '', 'note' => $e->note ?? ''])->all(),
        ], 'cost');
    }

    private static function payments($payments): array
    {
        return $payments->map(fn ($p) => ['id' => self::id($p->id), 'at' => self::ts($p->created_at), 'method' => $p->method, 'amount' => $p->amount,
            'userId' => self::id($p->user_id), 'ref' => $p->reference ?? '', 'note' => $p->reference ?? '', 'kind' => $p->kind])->all();
    }

    public function purchase(Purchase $p): array
    {
        $devs = $p->relationLoaded('devicesForSync') ? $p->devicesForSync : Device::where('purchase_id', $p->id)->get(['id', 'product_id']);

        return [
            'id' => self::id($p->id), 'no' => $p->no, 'supplierId' => self::id($p->supplier_id), 'supplierInvoice' => $p->supplier_invoice ?? '',
            'date' => self::day($p->date), 'expected' => self::day($p->expected_date) ?? '', 'note' => $p->note ?? '', 'status' => $p->status, 'total' => $p->total,
            'items' => $p->items->map(fn ($i) => ['productId' => self::id($i->product_id), 'qty' => $i->qty, 'cost' => $i->cost, 'condition' => $i->condition,
                'deviceIds' => $devs->where('product_id', $i->product_id)->pluck('id')->map(fn ($x) => (string) $x)->values()->all()])->all(),
            'payments' => self::payments($p->payments),
            'returns' => $p->returns->map(fn ($r) => ['at' => self::ts($r->created_at), 'userId' => self::id($r->user_id), 'amount' => $r->amount, 'reason' => $r->reason, 'items' => $r->items])->all(),
            'createdAt' => self::ts($p->created_at), 'createdBy' => self::id($p->created_by), 'receivedAt' => self::ts($p->received_at), 'receivedBy' => self::id($p->received_by),
            'cancelReason' => $p->cancel_reason, 'cancelledAt' => self::ts($p->cancelled_at),
        ];
    }

    public function sale(Sale $s): array
    {
        return [
            'id' => self::id($s->id), 'no' => $s->no, 'date' => self::day($s->date), 'at' => self::ts($s->created_at), 'userId' => self::id($s->user_id),
            'customerId' => self::id($s->customer_id), 'subtotal' => $s->subtotal, 'discount' => $s->discount, 'tax' => $s->tax, 'total' => $s->total,
            'taxInclusive' => $s->tax_inclusive, 'change' => $s->change_given, 'note' => $s->note ?? '', 'status' => $s->status,
            'cancelReason' => $s->cancel_reason, 'cancelledBy' => self::id($s->cancelled_by), 'cancelledAt' => self::ts($s->cancelled_at),
            'items' => $s->items->map(fn ($i) => $this->cost(['id' => self::id($i->id), 'productId' => self::id($i->product_id), 'deviceId' => self::id($i->device_id),
                'qty' => $i->qty, 'price' => $i->price, 'discount' => $i->discount, 'lineTotal' => $i->line_total, 'tax' => $i->tax, 'cost' => $i->cost,
                'name' => $i->name, 'code' => $i->code ?? '', 'returnedQty' => $i->returned_qty, 'warrantyId' => self::id($i->warranty_id)], 'cost'))->all(),
            'payments' => self::payments($s->payments),
            'returns' => $s->returns->map(fn ($r) => ['id' => self::id($r->id), 'at' => self::ts($r->created_at), 'userId' => self::id($r->user_id), 'amount' => $r->amount,
                'refund' => $r->refund, 'method' => $r->method, 'reason' => $r->reason, 'items' => $r->items])->all(),
            'replacements' => ($this->replacementsBySale ? $this->replacementsBySale->get($s->id, collect()) : Replacement::where('sale_id', $s->id)->get())->map(fn ($x) => ['no' => $x->no, 'at' => self::ts($x->created_at),
                'oldDeviceId' => self::id($x->old_device_id), 'newDeviceId' => self::id($x->new_device_id), 'oldCode' => $x->old_code, 'newCode' => $x->new_code,
                'claimNo' => Claim::whereKey($x->claim_id)->value('no'), 'warrantyNo' => Warranty::whereKey($x->new_warranty_id)->value('no')])->all(),
        ];
    }

    public function quote(Quotation $q): array
    {
        return ['id' => self::id($q->id), 'no' => $q->no, 'date' => self::day($q->date), 'at' => self::ts($q->created_at), 'userId' => self::id($q->user_id),
            'customerId' => self::id($q->customer_id), 'subtotal' => $q->subtotal, 'discount' => $q->discount, 'tax' => $q->tax, 'total' => $q->total,
            'note' => $q->note ?? '', 'validUntil' => self::day($q->valid_until),
            'items' => $q->items->map(fn ($i) => ['productId' => self::id($i->product_id), 'deviceId' => null, 'qty' => $i->qty, 'price' => $i->price,
                'discount' => $i->discount, 'name' => $i->name, 'lineTotal' => $i->line_total])->all()];
    }

    public function warranty(Warranty $w): array
    {
        $base = [
            'id' => self::id($w->id), 'no' => $w->no, 'kind' => $w->kind, 'status' => $w->status, 'customerId' => self::id($w->customer_id),
            'imei' => $w->imei ?? '', 'serial' => $w->serial ?? '', 'saleId' => self::id($w->sale_id), 'invoiceNo' => $w->invoice_no ?? '',
            'start' => self::day($w->start_date), 'terms' => $w->terms ?? '', 'voidReason' => $w->void_reason,
            'replacedByWarrantyId' => self::id($w->replaced_by_warranty_id), 'replacesWarrantyId' => self::id($w->replaces_warranty_id),
            'replacementNo' => $w->replacement_id ? Replacement::whereKey($w->replacement_id)->value('no') : null,
            'replacedDeviceCode' => $w->replaced_device_code, 'originalStart' => self::day($w->original_start), 'mode' => $w->mode,
            'history' => $w->events->map(fn ($e) => ['at' => self::ts($e->created_at), 'userId' => self::id($e->user_id), 'action' => $e->action, 'note' => $e->note ?? ''])->all(),
        ];
        if ($w->kind === 'repair') {
            return $base + ['repairId' => self::id($w->repair_id), 'jobNo' => $w->job_no, 'device' => $w->device_label,
                'components' => $w->components->map(fn ($c) => ['type' => $c->type, 'label' => $c->label, 'productId' => self::id($c->product_id), 'days' => $c->days, 'end' => self::day($c->end_date)])->all()];
        }

        return $base + ['productId' => self::id($w->product_id), 'deviceId' => self::id($w->device_id), 'provider' => $w->provider, 'type' => $w->type,
            'condition' => $w->condition, 'months' => $w->months, 'end' => self::day($w->end_date), 'qty' => $w->qty];
    }

    public function repair(Repair $r): array
    {
        return $this->cost([
            'id' => self::id($r->id), 'no' => $r->no, 'createdBy' => self::id($r->created_by), 'receivedAt' => self::ts($r->received_at), 'status' => $r->status,
            'customerId' => self::id($r->customer_id), 'brand' => $r->brand, 'model' => $r->model, 'color' => $r->color ?? '', 'imei' => $r->imei ?? '', 'serial' => $r->serial ?? '',
            'deviceId' => self::id($r->device_id), 'saleId' => self::id($r->sale_id), 'condition' => $r->condition ?? '', 'accessories' => $r->accessories ?? [],
            'problem' => $r->problem, 'existingDamage' => $r->existing_damage ?? '', 'type' => $r->type, 'priority' => $r->priority, 'estimate' => $r->estimate,
            'expected' => self::day($r->expected_date), 'technicianId' => self::id($r->technician_id), 'diagnosis' => $r->diagnosis ?? '', 'notes' => $r->notes ?? '',
            'parts' => $r->parts->map(fn ($p) => $this->cost(['id' => self::id($p->id), 'productId' => self::id($p->product_id), 'name' => $p->name, 'qty' => $p->qty,
                'price' => $p->price, 'cost' => $p->cost, 'covered' => $p->covered, 'warrantyDays' => $p->warranty_days], 'cost'))->all(),
            'labor' => $r->labor, 'laborCovered' => $r->labor_covered, 'techCost' => $r->tech_cost, 'discount' => $r->discount,
            'approval' => ['status' => $r->approval_status, 'amount' => $r->approval_amount, 'at' => self::ts($r->approval_at), 'by' => $r->approval_by ?? '', 'note' => ''],
            'termsAccepted' => $r->terms_accepted, 'payments' => self::payments($r->payments),
            'photos' => $r->attachments->where('kind', 'photo')->map(fn ($a) => URL::temporarySignedRoute('files.show', now()->addHours(12), ['attachment' => $a->id]))->values()->all(),
            'history' => $r->events->map(fn ($e) => ['at' => self::ts($e->created_at), 'userId' => self::id($e->user_id), 'status' => $e->status, 'note' => $e->note ?? ''])->all(),
            'isWarrantyRepair' => $r->is_warranty_repair, 'claimId' => self::id($r->claim_id), 'parentRepairId' => self::id($r->parent_repair_id),
            'completedAt' => self::ts($r->completed_at), 'readyAt' => self::ts($r->ready_at), 'deliveredAt' => self::ts($r->delivered_at), 'deliveredBy' => self::id($r->delivered_by),
            'collectedBy' => $r->collected_by, 'warrantyId' => self::id($r->warranty_id), 'cancelReason' => $r->cancel_reason, 'cancelledAt' => self::ts($r->cancelled_at),
            'signature' => $r->signature_path ? URL::temporarySignedRoute('files.signature', now()->addHours(12), ['repair' => $r->id]) : null,
        ], 'techCost');
    }

    public function claim(Claim $c): array
    {
        return [
            'id' => self::id($c->id), 'no' => $c->no, 'kind' => $c->kind, 'warrantyId' => self::id($c->warranty_id), 'customerId' => self::id($c->customer_id),
            'date' => self::day($c->date), 'at' => self::ts($c->created_at), 'createdBy' => self::id($c->created_by), 'fault' => $c->fault, 'flags' => (object) ($c->flags ?? []),
            'notes' => $c->notes ?? '', 'eligibility' => ['eligible' => $c->eligible, 'reasons' => $c->eligibility_reasons ?? []], 'status' => $c->status,
            'assignedTo' => self::id($c->assigned_to), 'findings' => $c->findings ?? '', 'decisionNote' => $c->decision_note ?? '', 'override' => $c->override,
            'resolution' => $c->resolution ?? '', 'resolutionNote' => $c->resolution_note ?? '', 'cost' => $c->cost, 'repairId' => self::id($c->repair_id),
            'replacementId' => self::id($c->replacement_id),
            'photos' => $c->attachments->map(fn ($a) => URL::temporarySignedRoute('files.show', now()->addHours(12), ['attachment' => $a->id]))->values()->all(),
            'history' => $c->events->map(fn ($e) => ['at' => self::ts($e->created_at), 'userId' => self::id($e->user_id), 'action' => $e->action, 'note' => $e->note ?? ''])->all(),
        ];
    }

    public function replacement(Replacement $x): array
    {
        return $this->cost(['id' => self::id($x->id), 'no' => $x->no, 'at' => self::ts($x->created_at), 'userId' => self::id($x->user_id), 'claimId' => self::id($x->claim_id),
            'customerId' => self::id($x->customer_id), 'saleId' => self::id($x->sale_id), 'oldDeviceId' => self::id($x->old_device_id), 'newDeviceId' => self::id($x->new_device_id),
            'oldCode' => $x->old_code, 'newCode' => $x->new_code, 'oldProductId' => self::id($x->old_product_id), 'newProductId' => self::id($x->new_product_id),
            'oldWarrantyId' => self::id($x->old_warranty_id), 'newWarrantyId' => self::id($x->new_warranty_id), 'mode' => $x->mode, 'cost' => $x->cost, 'note' => $x->note ?? ''], 'cost');
    }

    public function expense(Expense $e): array
    {
        return ['id' => self::id($e->id), 'no' => $e->no, 'at' => self::ts($e->created_at), 'userId' => self::id($e->user_id), 'date' => self::day($e->date),
            'category' => $e->category, 'amount' => $e->amount, 'method' => $e->method, 'note' => $e->note ?? '', 'status' => $e->status, 'voidReason' => $e->void_reason];
    }

    public function movement(StockMovement $m): array
    {
        return ['id' => self::id($m->id), 'at' => self::ts($m->created_at), 'userId' => self::id($m->user_id), 'productId' => self::id($m->product_id),
            'deviceId' => self::id($m->device_id), 'qty' => $m->qty, 'type' => $m->type, 'ref' => $m->ref ?? '', 'note' => $m->note ?? ''];
    }

    public function adjustment(StockAdjustment $a): array
    {
        return ['id' => self::id($a->id), 'no' => $a->no, 'at' => self::ts($a->created_at), 'userId' => self::id($a->requested_by), 'productId' => self::id($a->product_id),
            'deviceId' => self::id($a->device_id), 'qty' => $a->qty, 'type' => $a->type, 'reason' => $a->reason, 'status' => $a->status,
            'approvedBy' => self::id($a->approved_by), 'approvedAt' => self::ts($a->approved_at), 'rejectNote' => $a->reject_note];
    }

    public function activity(ActivityLog $a): array
    {
        return ['id' => self::id($a->id), 'at' => self::ts($a->created_at), 'userId' => self::id($a->user_id), 'module' => $a->module, 'action' => $a->action, 'detail' => $a->detail ?? '', 'ref' => $a->ref ?? ''];
    }
}
