<?php

namespace App\Services;

use App\Models\Claim;
use App\Models\ClaimEvent;
use App\Models\Device;
use App\Models\Product;
use App\Models\Repair;
use App\Models\Replacement;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Warranty;
use App\Models\WarrantyEvent;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class WarrantyService
{
    /* ---------------- Status & eligibility ---------------- */

    public static function status(Warranty $w): string
    {
        if (in_array($w->status, ['void', 'replaced'], true)) {
            return $w->status;
        }
        $days = (int) Carbon::today()->diffInDays($w->end_date, false);
        if ($days < 0) {
            return 'expired';
        }

        return $days <= (int) Shop::setting('expiring_days', 30) ? 'expiring' : 'active';
    }

    /** Checked against the warranty terms and exclusions — not only the expiry date. */
    public static function eligibility(Warranty $w, array $flags = []): array
    {
        $reasons = [];
        $active = [];
        if ($w->status === 'void') {
            $reasons[] = 'Warranty is void'.($w->void_reason ? ': '.$w->void_reason : '').'.';
        }
        if ($w->status === 'replaced') {
            $nw = Warranty::find($w->replaced_by_warranty_id);
            $reasons[] = 'This unit was already replaced under warranty — coverage moved to '.($nw ? "{$nw->no} (".($nw->imei ?: $nw->serial).')' : 'the replacement unit').'.';
        }
        if ($w->kind === 'repair') {
            $active = $w->components()->get()->filter(fn ($c) => $c->end_date->gte(Carbon::today()))->values();
            if ($active->isEmpty()) {
                $reasons[] = 'All repair warranty components expired (latest '.$w->end_date->format('d M Y').').';
            }
        } elseif ($w->end_date->lt(Carbon::today())) {
            $reasons[] = 'Warranty expired on '.$w->end_date->format('d M Y').'.';
        }
        if (! empty($flags['physical'])) {
            $reasons[] = 'Physical / impact damage is excluded by the warranty terms.';
        }
        if (! empty($flags['liquid'])) {
            $reasons[] = 'Liquid damage is excluded by the warranty terms.';
        }
        if (! empty($flags['tampered'])) {
            $reasons[] = 'Device was opened or repaired by an unauthorised party (warranty seal broken).';
        }
        if (! empty($flags['unrelated']) && $w->kind === 'repair') {
            $reasons[] = 'Complaint is unrelated to the repaired component / service.';
        }

        return ['eligible' => ! $reasons, 'reasons' => $reasons, 'active_components' => collect($active)->pluck('label')->all()];
    }

    public static function event(Warranty $w, string $action, string $note): void
    {
        WarrantyEvent::create(['warranty_id' => $w->id, 'action' => $action, 'note' => $note, 'user_id' => Auth::id()]);
    }

    private static function claimEvent(Claim $c, string $action, string $note): void
    {
        ClaimEvent::create(['claim_id' => $c->id, 'action' => $action, 'note' => $note, 'user_id' => Auth::id()]);
    }

    /* ---------------- Registration ---------------- */

    /**
     * Called by SaleService for every sold item. The warranty always starts on the sale date.
     * $chosenMonths: period selected by the seller (required for serialized units; 0 = no warranty).
     * Without a choice (accessories) the product's standard period applies.
     */
    public static function registerForSale(Sale $sale, SaleItem $item, ?Device $device, ?int $chosenMonths = null): ?Warranty
    {
        $p = Product::findOrFail($item->product_id);
        $cond = $device?->condition ?? 'new';
        $standard = $cond === 'new' ? $p->warranty_months : ($p->used_warranty_months ?? 3);
        $months = $chosenMonths ?? $standard;
        if (! $months) {
            return null;
        }
        $provider = $cond === 'new' ? $p->warranty_provider : 'Shop';
        $start = Carbon::parse($sale->date);
        $terms = Shop::setting('terms', []);
        $w = Warranty::create([
            'no' => DocNumber::next('pw', 'PW-'), 'kind' => 'product', 'status' => 'active',
            'customer_id' => $sale->customer_id, 'product_id' => $p->id, 'device_id' => $device?->id,
            'imei' => $device?->imei1, 'serial' => $device?->serial, 'sale_id' => $sale->id, 'invoice_no' => $sale->no,
            'provider' => $provider, 'type' => "$provider warranty", 'condition' => $cond, 'months' => $months,
            'qty' => $device ? 1 : $item->qty, 'start_date' => $start, 'end_date' => $start->copy()->addMonthsNoOverflow($months)->subDay(),
            'terms' => $cond === 'new' ? ($terms['product'] ?? '') : ($terms['used'] ?? ''),
        ]);
        self::event($w, 'Registered', ($chosenMonths !== null ? "Warranty of $months months selected at sale" : "Standard $months-month warranty")." on {$sale->no}, from the sale date {$start->format('d M Y')}".($chosenMonths !== null && $chosenMonths !== (int) $standard ? " (product standard: {$standard} months)" : '').'.');

        return $w;
    }

    /** Repair warranty: labour and each replaced part get their own period. Separate from the product warranty. */
    public static function registerForRepair(Repair $r, int $laborDays, array $partDays): ?Warranty
    {
        $base = Shop::setting('repair_warranty_start') === 'completion' && $r->completed_at ? $r->completed_at : $r->delivered_at;
        $start = Carbon::parse($base)->startOfDay();
        $comps = [];
        if ($laborDays > 0) {
            $comps[] = ['type' => 'labor', 'label' => "Labour – {$r->type}", 'product_id' => null, 'days' => $laborDays, 'end_date' => $start->copy()->addDays($laborDays - 1)];
        }
        foreach ($r->parts()->get()->values() as $i => $part) {
            $d = (int) ($partDays[$i] ?? $part->warranty_days);
            if ($d > 0) {
                $comps[] = ['type' => 'part', 'label' => "{$part->qty} × {$part->name}", 'product_id' => $part->product_id, 'days' => $d, 'end_date' => $start->copy()->addDays($d - 1)];
            }
        }
        if (! $comps) {
            return null;
        }
        $w = Warranty::create([
            'no' => DocNumber::next('rw', 'RW-'), 'kind' => 'repair', 'status' => 'active', 'customer_id' => $r->customer_id,
            'repair_id' => $r->id, 'job_no' => $r->no, 'device_label' => "{$r->brand} {$r->model}", 'imei' => $r->imei, 'serial' => $r->serial,
            'device_id' => $r->device_id, 'sale_id' => $r->sale_id, 'invoice_no' => $r->sale_id ? Sale::whereKey($r->sale_id)->value('no') : null,
            'start_date' => $start, 'end_date' => collect($comps)->max('end_date'), 'terms' => Shop::setting('terms', [])['repair'] ?? '',
        ]);
        $w->components()->createMany($comps);
        self::event($w, 'Registered', 'Repair warranty from '.$start->format('d M Y').' ('.collect($comps)->map(fn ($c) => "{$c['label']}: {$c['days']}d")->implode('; ').')');

        return $w;
    }

    /* ---------------- Extension ---------------- */

    public static function extend(Warranty $w, ?int $months, ?int $days, string $reason): Warranty
    {
        if ($w->status !== 'active') {
            Shop::fail('Only active warranties can be extended.');
        }

        return DB::transaction(function () use ($w, $months, $days, $reason) {
            $old = $w->end_date->copy();
            if ($w->kind === 'product') {
                if (! $months || $months < 1) {
                    Shop::fail('Enter the number of months to extend.');
                }
                $w->update(['end_date' => $old->copy()->addMonthsNoOverflow($months)]);
                $note = "{$old->format('d M Y')} → {$w->end_date->format('d M Y')} (+$months months). $reason";
            } else {
                if (! $days || $days < 1) {
                    Shop::fail('Enter the number of days to extend.');
                }
                foreach ($w->components as $c) {
                    $c->update(['end_date' => $c->end_date->copy()->addDays($days), 'days' => $c->days + $days]);
                }
                $w->update(['end_date' => $old->copy()->addDays($days)]);
                $note = "All components +$days days. $reason";
            }
            self::event($w, 'Extended', $note);
            Audit::log('warranties', 'Warranty extended', "{$w->no}: $note", $w->no);

            return $w->fresh();
        });
    }

    /* ---------------- Claims ---------------- */

    public static function createClaim(array $d): Claim
    {
        return DB::transaction(function () use ($d) {
            $w = Warranty::lockForUpdate()->findOrFail($d['warranty_id']);
            $open = Claim::where('warranty_id', $w->id)->whereIn('status', ['pending', 'inspection', 'approved'])->first();
            if ($open) {
                Shop::fail("An open claim already exists for this warranty: {$open->no}.");
            }
            $flags = array_filter($d['flags'] ?? []);
            $elig = self::eligibility($w, $flags);
            $c = Claim::create([
                'no' => DocNumber::next('claim', $w->kind === 'product' ? 'PWC-' : 'RWC-'), 'kind' => $w->kind, 'warranty_id' => $w->id,
                'customer_id' => $w->customer_id, 'date' => Carbon::today(), 'fault' => $d['fault'], 'flags' => $flags, 'notes' => $d['notes'] ?? null,
                'eligible' => $elig['eligible'], 'eligibility_reasons' => $elig['reasons'], 'status' => 'pending', 'created_by' => Auth::id(),
            ]);
            self::claimEvent($c, 'Registered', $elig['eligible'] ? 'Pre-check: within warranty terms' : 'Pre-check: NOT eligible — '.implode(' ', $elig['reasons']));
            self::event($w, 'Claim registered', "{$c->no}: {$d['fault']}");
            Audit::log('warranties', 'Claim registered', "{$c->no} on {$w->no} — {$d['fault']}", $c->no);

            return $c;
        });
    }

    public static function updateClaim(Claim $c, array $patch): Claim
    {
        $newStatus = $patch['status'] ?? null;
        if ($newStatus && in_array($newStatus, ['approved', 'rejected'], true) && $newStatus !== $c->status) {
            Shop::need('warranties', 'approve');
        }

        return DB::transaction(function () use ($c, $patch, $newStatus) {
            $c = Claim::lockForUpdate()->findOrFail($c->id);
            if (in_array($c->status, ['resolved', 'rejected'], true) && $newStatus && $newStatus !== $c->status) {
                Shop::fail('This claim is closed.');
            }
            $flow = ['pending' => ['inspection', 'approved', 'rejected'], 'inspection' => ['approved', 'rejected'], 'approved' => ['resolved']];
            if ($newStatus && $newStatus !== $c->status && ! in_array($newStatus, $flow[$c->status] ?? [], true)) {
                Shop::fail("A claim cannot move from {$c->status} to {$newStatus}.");
            }
            $w = $c->warranty;
            if (isset($patch['flags'])) {
                $patch['flags'] = array_filter($patch['flags']);
            }
            if ($newStatus === 'approved') {
                $elig = self::eligibility($w, $patch['flags'] ?? $c->flags ?? []);
                if (! $elig['eligible'] && empty($patch['override'])) {
                    Shop::fail('Claim is not eligible: '.implode(' ', $elig['reasons']).' Tick “Goodwill override” to approve anyway.');
                }
            }
            if ($newStatus === 'resolved' && empty($patch['resolution']) && ! $c->resolution) {
                Shop::fail('Select how the claim was resolved.');
            }
            $before = $c->status;
            $c->fill(collect($patch)->only(['status', 'assigned_to', 'findings', 'decision_note', 'resolution', 'resolution_note', 'cost', 'flags', 'override'])->all())->save();
            $note = $newStatus && $newStatus !== $before
                ? "Status $before → $newStatus".(! empty($patch['decision_note']) ? ': '.$patch['decision_note'] : '').(! empty($patch['override']) ? ' (goodwill override)' : '')
                : 'Claim details updated';
            self::claimEvent($c, $newStatus ?: 'Updated', $note);
            if ($newStatus && $newStatus !== $before) {
                self::event($w, "Claim $newStatus", $c->no.(! empty($patch['decision_note']) ? ': '.$patch['decision_note'] : ''));
            }
            Audit::log('warranties', 'Claim updated', "{$c->no}: $note", $c->no);

            return $c;
        });
    }

    /** Approved claim → free warranty repair job (linked both ways). */
    public static function claimToRepair(Claim $c): Repair
    {
        if ($c->status !== 'approved') {
            Shop::fail('Approve the claim before creating a warranty repair job.');
        }
        if ($c->repair_id) {
            Shop::fail('A repair job is already linked to this claim.');
        }

        return DB::transaction(function () use ($c) {
            $w = $c->warranty;
            $parent = $w->kind === 'repair' ? Repair::find($w->repair_id) : null;
            $p = $w->product_id ? Product::find($w->product_id) : null;
            $r = RepairService::create([
                'customer_id' => $c->customer_id, 'brand' => $parent?->brand ?? $p?->brand ?? 'Unknown', 'model' => $parent?->model ?? ($p?->model ?: $p?->name) ?? 'Unknown',
                'imei' => $w->imei, 'serial' => $w->serial, 'problem' => "[Warranty claim {$c->no}] {$c->fault}", 'condition' => 'As per claim inspection',
                'type' => $parent?->type ?? 'General service', 'estimate' => 0, 'terms_accepted' => true, 'estimate_approved' => true,
                'is_warranty_repair' => true, 'claim_id' => $c->id, 'parent_repair_id' => $parent?->id, 'technician_id' => $parent?->technician_id,
            ], skipOpenCheck: true);
            $r->update(['approval_status' => 'approved', 'approval_amount' => 0, 'approval_at' => now(), 'approval_by' => 'Warranty', 'labor_covered' => true]);
            $c->update(['repair_id' => $r->id, 'resolution' => 'repair']);
            self::claimEvent($c, 'Repair created', "Linked warranty repair {$r->no}");

            return $r;
        });
    }

    /**
     * Warranty replacement: the defective unit comes back, a new unit goes to the customer.
     * Both IMEIs are linked permanently and both units' histories record the swap.
     * The staff member always chooses the replacement unit's warranty period:
     *   remaining → until the original warranty's end date
     *   months    → $months months from today
     *   date      → until $endDate
     */
    public static function replace(Claim $c, int $newDeviceId, string $mode, ?string $note = null, ?int $months = null, ?string $endDate = null): Replacement
    {
        if (! in_array($mode, ['remaining', 'months', 'date'], true)) {
            Shop::fail('Choose the warranty period for the replacement unit.');
        }
        if ($mode === 'months' && (! $months || $months < 1 || $months > 120)) {
            Shop::fail('Enter the warranty period in months (1–120).');
        }
        if ($mode === 'date' && (! $endDate || Carbon::parse($endDate)->lt(Carbon::today()))) {
            Shop::fail('Choose a warranty end date from today onwards.');
        }

        return DB::transaction(function () use ($c, $newDeviceId, $mode, $note, $months, $endDate) {
            $c = Claim::lockForUpdate()->findOrFail($c->id);
            if ($c->kind !== 'product') {
                Shop::fail('Unit replacement applies to product warranty claims only.');
            }
            if ($c->status !== 'approved') {
                Shop::fail('Approve the claim before issuing a replacement unit.');
            }
            $w = Warranty::lockForUpdate()->findOrFail($c->warranty_id);
            $old = $w->device_id ? Device::lockForUpdate()->find($w->device_id) : null;
            if (! $old) {
                Shop::fail('This warranty is not linked to a serialized unit (IMEI / serial).');
            }
            if ($old->status !== 'sold') {
                Shop::fail('The original unit is '.strtolower(Inventory::label($old->status)).' — it cannot be replaced.');
            }
            $new = Device::lockForUpdate()->find($newDeviceId);
            if (! $new) {
                Shop::fail('Select the replacement unit (IMEI / serial).');
            }
            if ($new->id === $old->id) {
                Shop::fail('The replacement must be a different unit.');
            }
            if ($new->status !== 'in_stock') {
                Shop::fail(Inventory::code($new).' is not available ('.Inventory::label($new->status).').');
            }
            $np = $new->product;
            $no = DocNumber::next('replacement', 'RPL-');
            $cust = $c->customer?->name ?? 'customer';
            $oldCode = Inventory::code($old);
            $newCode = Inventory::code($new);

            // defective unit returns to the shop, not sellable
            $old->update(['status' => 'warranty_return', 'condition' => 'damaged', 'replaced_by_device_id' => $new->id]);
            Inventory::event($old, 'Warranty return (defective)', $no, "Returned by $cust under warranty {$w->no} / claim {$c->no}: ".rtrim($c->fault, '.').". Replaced with {$np->name} $newCode.");
            Inventory::move($old->product_id, 0, 'Warranty return in (defective, not sellable)', $no, "Replaced by $newCode", $old->id);

            // replacement unit goes to the customer
            $new->update(['status' => 'sold', 'customer_id' => $c->customer_id, 'sale_id' => $w->sale_id, 'sold_at' => now(), 'replacement_of_device_id' => $old->id]);
            Inventory::event($new, 'Issued as warranty replacement', $no, "Given free of charge to $cust as replacement for defective $oldCode (claim {$c->no}, original invoice {$w->invoice_no}).");
            Inventory::move($new->product_id, -1, 'Warranty replacement out', $no, "Replaces defective $oldCode", $new->id);

            // coverage moves to the new unit
            $end = match ($mode) {
                'remaining' => $w->end_date->copy(),
                'months' => Carbon::today()->addMonthsNoOverflow($months)->subDay(),
                'date' => Carbon::parse($endDate)->startOfDay(),
            };
            if ($mode === 'remaining' && $end->lt(Carbon::today())) {
                Shop::fail('The original warranty has already ended — choose a number of months or an end date instead.');
            }
            $months = $mode === 'months' ? $months : max(1, (int) round(Carbon::today()->diffInDays($end) / 30.44));
            $periodText = match ($mode) {
                'remaining' => 'Continues the remaining original period',
                'months' => "New $months-month period chosen at replacement",
                'date' => 'Period chosen at replacement',
            };
            $nw = Warranty::create([
                'no' => DocNumber::next('pw', 'PW-'), 'kind' => 'product', 'status' => 'active', 'customer_id' => $c->customer_id,
                'product_id' => $np->id, 'device_id' => $new->id, 'imei' => $new->imei1, 'serial' => $new->serial, 'sale_id' => $w->sale_id,
                'invoice_no' => $w->invoice_no, 'provider' => $w->provider, 'type' => "{$w->provider} warranty — replacement unit", 'condition' => $new->condition,
                'months' => $months, 'qty' => 1, 'start_date' => Carbon::today(), 'end_date' => $end, 'original_start' => $w->original_start ?? $w->start_date,
                'terms' => $w->terms, 'replaces_warranty_id' => $w->id, 'replaced_device_code' => $oldCode, 'mode' => $mode,
            ]);
            self::event($nw, 'Registered', "Replacement warranty for defective $oldCode (was {$w->no}). $periodText — valid until ".$end->format('d M Y').'.');

            $rec = Replacement::create([
                'no' => $no, 'claim_id' => $c->id, 'customer_id' => $c->customer_id, 'sale_id' => $w->sale_id,
                'old_device_id' => $old->id, 'new_device_id' => $new->id, 'old_code' => $oldCode, 'new_code' => $newCode,
                'old_product_id' => $old->product_id, 'new_product_id' => $np->id, 'old_warranty_id' => $w->id, 'new_warranty_id' => $nw->id,
                'mode' => $mode, 'cost' => $new->cost, 'note' => $note, 'user_id' => Auth::id(),
            ]);
            $nw->update(['replacement_id' => $rec->id]);
            $new->update(['warranty_id' => $nw->id, 'replacement_id' => $rec->id]);
            $old->update(['replacement_id' => $rec->id]);
            $w->update(['status' => 'replaced', 'replaced_by_warranty_id' => $nw->id, 'replacement_id' => $rec->id]);
            self::event($w, 'Replaced', "Unit $oldCode returned defective and replaced by $newCode ($no). Coverage continues on {$nw->no} until {$end->format('d M Y')}.");

            $resolution = "Replaced defective $oldCode with $newCode ($no)".($note ? ". $note" : '');
            $c->update(['status' => 'resolved', 'resolution' => 'replacement', 'replacement_id' => $rec->id, 'cost' => $new->cost, 'resolution_note' => mb_substr($resolution, 0, 250)]);
            self::claimEvent($c, 'resolved', $resolution);
            Audit::log('warranties', 'Warranty replacement', "$no: defective $oldCode → new $newCode for $cust (claim {$c->no}); warranty {$nw->no} until {$end->format('d M Y')}", $no);

            return $rec;
        });
    }
}
