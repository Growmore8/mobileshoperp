<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Repair;
use App\Models\RepairEvent;
use App\Models\RepairPart;
use App\Support\Imei;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class RepairService
{
    public const STATUSES = [
        'received' => 'Received', 'inspection' => 'Inspection Pending', 'diagnosed' => 'Diagnosis Completed',
        'awaiting_approval' => 'Awaiting Customer Approval', 'awaiting_parts' => 'Awaiting Spare Parts', 'in_progress' => 'Repair in Progress',
        'completed' => 'Repair Completed', 'qc' => 'Quality Check', 'ready' => 'Ready for Collection', 'delivered' => 'Delivered', 'cancelled' => 'Cancelled',
    ];

    public static function isOpen(Repair $r): bool
    {
        return ! in_array($r->status, ['delivered', 'cancelled'], true);
    }

    private static function event(Repair $r, string $note, ?string $status = null): void
    {
        RepairEvent::create(['repair_id' => $r->id, 'status' => $status ?? $r->status, 'note' => $note, 'user_id' => Auth::id()]);
    }

    private static function lockOpen(Repair $r): Repair
    {
        $r = Repair::lockForUpdate()->findOrFail($r->id);
        if (! self::isOpen($r)) {
            Shop::fail('This job is already closed.');
        }

        return $r;
    }

    public static function create(array $d, bool $skipOpenCheck = false): Repair
    {
        return DB::transaction(function () use ($d, $skipOpenCheck) {
            $cust = Customer::findOrFail($d['customer_id']);
            $imei = Imei::normalize($d['imei'] ?? '');
            $serial = Imei::normalize($d['serial'] ?? '');
            if (! $imei && ! $serial) {
                Shop::fail('Enter the IMEI or serial number of the device.');
            }
            if ($imei && ! preg_match('/^\d{15}$/', $imei)) {
                Shop::fail('IMEI must be exactly 15 digits.');
            }
            if (empty($d['terms_accepted'])) {
                Shop::fail('Customer must accept the repair terms before the job is created.');
            }
            if (! $skipOpenCheck && $imei) {
                $open = Repair::where('imei', $imei)->whereNotIn('status', ['delivered', 'cancelled'])->first();
                if ($open) {
                    Shop::fail("This device already has an open repair job: {$open->no} (".self::STATUSES[$open->status].').');
                }
            }
            if (! empty($d['technician_id']) && ! Shop::can('repairs', 'manage') && (int) $d['technician_id'] !== Auth::id()) {
                Shop::fail('Only users with Repairs “Manage” permission can assign technicians.', 403);
            }
            $own = Inventory::findDevice($imei ?: $serial);
            $estimate = Shop::money($d['estimate'] ?? 0);
            $approved = $estimate > 0 && ! empty($d['estimate_approved']);
            $r = Repair::create([
                'no' => DocNumber::next('repair', 'RJ-'), 'customer_id' => $cust->id, 'device_id' => $own?->id, 'sale_id' => $own?->sale_id,
                'brand' => $d['brand'], 'model' => $d['model'], 'color' => $d['color'] ?? null, 'imei' => $imei ?: null, 'serial' => $serial ?: null,
                'condition' => $d['condition'] ?? null, 'accessories' => $d['accessories'] ?? [], 'problem' => $d['problem'],
                'existing_damage' => $d['existing_damage'] ?? null, 'type' => $d['type'] ?? 'General service', 'priority' => $d['priority'] ?? 'Normal',
                'estimate' => $estimate, 'expected_date' => $d['expected_date'] ?? Carbon::today()->addDays(3), 'technician_id' => $d['technician_id'] ?? null,
                'approval_status' => $approved ? 'approved' : 'pending', 'approval_amount' => $estimate, 'approval_at' => $approved ? now() : null,
                'approval_by' => $approved ? 'Customer (at intake)' : null, 'terms_accepted' => true, 'status' => 'received', 'received_at' => now(),
                'is_warranty_repair' => ! empty($d['is_warranty_repair']), 'claim_id' => $d['claim_id'] ?? null, 'parent_repair_id' => $d['parent_repair_id'] ?? null,
                'created_by' => Auth::id(),
            ]);
            if (($d['advance'] ?? 0) > 0) {
                $r->payments()->create(['kind' => 'advance', 'method' => $d['advance_method'] ?? 'Cash', 'amount' => Shop::money($d['advance']), 'reference' => 'Advance', 'user_id' => Auth::id()]);
            }
            self::event($r, "Device received. Problem: {$d['problem']}");
            if ($own) {
                Inventory::event($own, 'Repair intake', $r->no, $d['problem']);
            }
            Audit::log('repairs', 'Repair job created', "{$r->no} — {$r->brand} {$r->model} for {$cust->name}", $r->no);

            return $r;
        });
    }

    public static function update(Repair $r, array $patch, ?string $note = null): Repair
    {
        return DB::transaction(function () use ($r, $patch, $note) {
            $r = self::lockOpen($r);
            if (array_key_exists('technician_id', $patch) && (int) $patch['technician_id'] !== (int) $r->technician_id) {
                Shop::need('repairs', 'manage');
            }
            if (array_key_exists('tech_cost', $patch) && ! Shop::can('reports', 'manage')) {
                unset($patch['tech_cost']); // internal cost is financial data
            }
            if (array_key_exists('estimate', $patch) && Shop::money($patch['estimate']) !== $r->estimate) {
                $patch += ['approval_status' => 'pending', 'approval_amount' => Shop::money($patch['estimate']), 'approval_at' => null, 'approval_by' => null];
            }
            $r->fill($patch);
            $dirty = array_keys($r->getDirty());
            $r->save();
            if ($dirty) {
                $label = in_array('technician_id', $dirty, true) ? 'Assigned to '.($r->technician?->name ?? 'nobody') : ($note ?? 'Updated: '.implode(', ', $dirty));
                self::event($r, $label);
                Audit::log('repairs', 'Repair updated', "{$r->no}: $label", $r->no);
            }

            return $r;
        });
    }

    public static function setStatus(Repair $r, string $status, ?string $note = null): Repair
    {
        return DB::transaction(function () use ($r, $status, $note) {
            $r = self::lockOpen($r);
            if ($status === 'delivered') {
                Shop::fail('Use “Deliver to customer” to complete the hand-over.');
            }
            if ($status === 'cancelled') {
                Shop::fail('Use “Cancel job” to cancel.');
            }
            if (in_array($status, ['in_progress', 'completed', 'qc', 'ready'], true) && $r->approval_status === 'rejected') {
                Shop::fail('Customer rejected the estimate — the repair cannot proceed. Cancel the job or record a new estimate.');
            }
            if ($status === 'in_progress' && $r->approval_status !== 'approved' && ! $r->is_warranty_repair) {
                Shop::fail('Customer approval of the estimate is required before starting the repair.');
            }
            if ($status === 'ready' && ! $r->diagnosis) {
                Shop::fail('Record the diagnosis / work done before marking as ready.');
            }
            $prev = $r->status;
            $r->status = $status;
            if (in_array($status, ['completed', 'ready'], true) && ! $r->completed_at) {
                $r->completed_at = now();
            }
            if ($status === 'ready') {
                $r->ready_at = now();
            }
            $r->save();
            $text = $note ?: self::STATUSES[$prev].' → '.self::STATUSES[$status];
            self::event($r, $text);
            Audit::log('repairs', 'Repair status', "{$r->no}: ".self::STATUSES[$prev].' → '.self::STATUSES[$status].($note ? " — $note" : ''), $r->no);

            return $r;
        });
    }

    public static function approval(Repair $r, bool $approved, ?string $note = null, ?float $amount = null): Repair
    {
        return DB::transaction(function () use ($r, $approved, $note, $amount) {
            $r = self::lockOpen($r);
            $amt = Shop::money($amount ?? $r->estimate);
            $r->update(['approval_status' => $approved ? 'approved' : 'rejected', 'approval_amount' => $amt, 'approval_at' => now(), 'approval_by' => $note ?: 'Customer', 'estimate' => $amt]);
            self::event($r, 'Customer '.($approved ? 'APPROVED' : 'REJECTED').' estimate of '.Shop::fmt($amt).($note ? " — $note" : ''));
            Audit::log('repairs', $approved ? 'Estimate approved' : 'Estimate rejected', "{$r->no}: ".Shop::fmt($amt), $r->no);

            return $r;
        });
    }

    public static function addPart(Repair $r, int $productId, int $qty, ?float $price, bool $covered): RepairPart
    {
        return DB::transaction(function () use ($r, $productId, $qty, $price, $covered) {
            $r = self::lockOpen($r);
            $p = Product::lockForUpdate()->findOrFail($productId);
            if ($p->tracking !== 'qty') {
                Shop::fail('Serialized items cannot be issued as repair parts.');
            }
            if ($qty < 1) {
                Shop::fail('Enter a valid quantity.');
            }
            if ($qty > $p->qty) {
                Shop::fail("{$p->name}: only {$p->qty} in stock. Mark the job “Awaiting Spare Parts” and raise a purchase.");
            }
            $p->decrement('qty', $qty);
            $part = $r->parts()->create([
                'product_id' => $p->id, 'name' => $p->name, 'qty' => $qty, 'price' => Shop::money($price ?? $p->price),
                'cost' => $p->cost, 'covered' => $covered, 'warranty_days' => $p->repair_warranty_days ?? 90,
            ]);
            Inventory::move($p->id, -$qty, 'Issued to repair', $r->no);
            self::event($r, "Part issued: $qty × {$p->name}".($covered ? ' (warranty – no charge)' : ''));
            Audit::log('repairs', 'Part issued', "{$r->no}: $qty × {$p->name}", $r->no);

            return $part;
        });
    }

    public static function removePart(Repair $r, RepairPart $part): void
    {
        DB::transaction(function () use ($r, $part) {
            $r = self::lockOpen($r);
            if ($part->repair_id !== $r->id) {
                Shop::fail('Part does not belong to this job.');
            }
            Product::whereKey($part->product_id)->increment('qty', $part->qty);
            Inventory::move($part->product_id, $part->qty, 'Returned from repair', $r->no);
            $part->delete();
            self::event($r, "Part returned to stock: {$part->qty} × {$part->name}");
            Audit::log('repairs', 'Part returned', "{$r->no}: {$part->qty} × {$part->name}", $r->no);
        });
    }

    public static function pay(Repair $r, string $method, float $amount): Payment
    {
        return DB::transaction(function () use ($r, $method, $amount) {
            $r = Repair::lockForUpdate()->findOrFail($r->id);
            if ($r->status === 'cancelled') {
                Shop::fail('This job is cancelled.');
            }
            $amount = Shop::money($amount);
            $bal = Totals::repair($r)['balance'];
            if ($amount <= 0) {
                Shop::fail('Enter an amount above zero.');
            }
            if ($amount > $bal + 0.001) {
                Shop::fail('Amount exceeds balance due ('.Shop::fmt($bal).').');
            }
            $pay = $r->payments()->create(['kind' => 'receipt', 'method' => $method, 'amount' => $amount, 'user_id' => Auth::id()]);
            self::event($r, 'Payment received '.Shop::fmt($amount)." ($method)");
            Audit::log('repairs', 'Repair payment', "{$r->no}: ".Shop::fmt($amount)." ($method)", $r->no);

            return $pay;
        });
    }

    /**
     * Hand-over. Requires status ready, collector name, confirmation, signature (if configured) and a settled balance
     * (or Repairs “Approve” to deliver on credit). Registers the repair warranty.
     * $d = collected_by, confirm, signature (data URL)?, payment?, method?, credit?, labor_days?, part_days?[]
     */
    public static function deliver(Repair $r, array $d): Repair
    {
        return DB::transaction(function () use ($r, $d) {
            $r = self::lockOpen($r);
            if ($r->status !== 'ready') {
                Shop::fail('Only jobs marked “Ready for Collection” can be delivered.');
            }
            if (mb_strlen(trim($d['collected_by'] ?? '')) < 2) {
                Shop::fail('Enter the name of the person collecting the device.');
            }
            if (empty($d['confirm'])) {
                Shop::fail('Customer confirmation of device condition is required.');
            }
            if (Shop::setting('require_signature', true) && empty($d['signature'])) {
                Shop::fail('Customer signature is required for delivery.');
            }
            if (($d['payment'] ?? 0) > 0) {
                self::pay($r, $d['method'] ?? 'Cash', (float) $d['payment']);
            }
            $t = Totals::repair($r);
            if ($t['balance'] > 0.001) {
                if (empty($d['credit'])) {
                    Shop::fail('Outstanding balance of '.Shop::fmt($t['balance']).' must be settled before delivery.');
                }
                Shop::need('repairs', 'approve');
            }
            $typeDays = (int) (collect(Shop::setting('repair_types', []))->firstWhere('name', $r->type)['labor_days'] ?? 30);
            $laborDays = isset($d['labor_days']) && $d['labor_days'] !== '' ? (int) $d['labor_days'] : $typeDays;
            $partDays = $d['part_days'] ?? [];
            $parts = $r->parts()->get()->values();
            $overridden = $laborDays !== $typeDays || $parts->contains(fn ($p, $i) => isset($partDays[$i]) && (int) $partDays[$i] !== $p->warranty_days);
            if ($overridden) {
                Shop::need('warranties', 'edit');
            }
            $sig = null;
            if (! empty($d['signature']) && str_starts_with($d['signature'], 'data:image/png;base64,')) {
                $sig = "signatures/{$r->no}-".now()->format('YmdHis').'.png';
                Storage::disk('local')->put($sig, base64_decode(substr($d['signature'], 22)));
            }
            $r->update(['status' => 'delivered', 'delivered_at' => now(), 'delivered_by' => Auth::id(), 'collected_by' => trim($d['collected_by']), 'signature_path' => $sig]);
            self::event($r, 'Delivered to '.trim($d['collected_by']).($t['balance'] > 0 ? ' — on credit, balance '.Shop::fmt($t['balance']) : ''));
            $w = WarrantyService::registerForRepair($r->fresh(), $laborDays, $partDays);
            if ($w) {
                $r->update(['warranty_id' => $w->id]);
            }
            if ($r->device) {
                Inventory::event($r->device, 'Repair delivered', $r->no, (string) $r->diagnosis);
            }
            Audit::log('repairs', 'Repair delivered', "{$r->no} delivered to {$r->collected_by}".($w ? " — repair warranty {$w->no}" : ''), $r->no);

            return $r->fresh();
        });
    }

    public static function cancel(Repair $r, string $reason): Repair
    {
        return DB::transaction(function () use ($r, $reason) {
            $r = self::lockOpen($r);
            foreach ($r->parts as $part) {
                self::removePart($r, $part);
            }
            $r->update(['status' => 'cancelled', 'cancel_reason' => $reason, 'cancelled_at' => now()]);
            self::event($r, "Cancelled: $reason", 'cancelled');
            Audit::log('repairs', 'Repair cancelled', "{$r->no}: $reason", $r->no);

            return $r;
        });
    }
}
