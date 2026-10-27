<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\Repair;
use App\Models\Replacement;
use App\Models\Warranty;

class RepairAndWarrantyTest extends ShopTestCase
{
    private function newJob(array $extra = []): array
    {
        return $this->as($this->sales)->postJson('/api/repairs', $extra + [
            'customer_id' => $this->customer->id, 'brand' => 'Samsung', 'model' => 'Galaxy A25', 'imei' => self::imei(),
            'problem' => 'Battery drains fast', 'type' => 'Battery replacement', 'estimate' => 3400, 'estimate_approved' => true, 'terms_accepted' => true,
        ])->assertCreated()->json('data');
    }

    public function test_full_repair_flow_with_guards_parts_payment_delivery_and_repair_warranty(): void
    {
        $this->receiveStock(1);
        $job = $this->newJob();
        $id = $job['id'];

        // technician cannot reassign; manager can
        $this->as($this->tech)->putJson("/api/repairs/$id", ['technician_id' => $this->sales->id])->assertStatus(403);
        $this->as($this->manager)->putJson("/api/repairs/$id", ['technician_id' => $this->tech->id])->assertOk();

        $this->as($this->tech);
        $this->postJson("/api/repairs/$id/status", ['status' => 'ready'])->assertStatus(422)->assertJsonPath('message', 'Record the diagnosis / work done before marking the job as ready.');
        $this->putJson("/api/repairs/$id", ['diagnosis' => 'Battery swollen, replaced.', 'labor' => 1500])->assertOk();
        $this->postJson("/api/repairs/$id/parts", ['product_id' => $this->battery->id, 'qty' => 1])->assertCreated();
        $this->assertSame(4, $this->battery->fresh()->qty);
        foreach (['inspection', 'diagnosed', 'in_progress', 'completed', 'qc', 'ready'] as $s) {
            $this->postJson("/api/repairs/$id/status", ['status' => $s])->assertOk();
        }

        // delivery guards (technician: has Repairs “Edit” but not Warranties “Edit”)
        $this->as($this->tech);
        $this->postJson("/api/repairs/$id/deliver", ['collected_by' => 'Ishara', 'confirm' => true, 'signature' => 'data:image/png;base64,iVBORw0KGgo='])
            ->assertStatus(422)->assertJsonPath('message', 'Outstanding balance of Rs. 3,400 must be settled before delivery.');
        $this->postJson("/api/repairs/$id/deliver", ['collected_by' => 'Ishara', 'confirm' => true, 'payment' => 3400, 'method' => 'Cash'])
            ->assertStatus(422)->assertJsonPath('message', 'Customer signature is required for delivery.');
        // overriding warranty days needs Warranties “Edit”
        $this->postJson("/api/repairs/$id/deliver", ['collected_by' => 'Ishara', 'confirm' => true, 'signature' => 'data:image/png;base64,iVBORw0KGgo=', 'payment' => 3400, 'method' => 'Cash', 'labor_days' => 90])->assertStatus(403);

        $res = $this->postJson("/api/repairs/$id/deliver", ['collected_by' => 'Ishara', 'confirm' => true, 'signature' => 'data:image/png;base64,iVBORw0KGgo=', 'payment' => 3400, 'method' => 'Cash'])
            ->assertOk()->assertJsonPath('data.status', 'delivered')->json('data');
        $w = Warranty::with('components')->find($res['warranty_id']);
        $this->assertSame('repair', $w->kind);
        $this->assertEqualsCanonicalizing([30, 180], $w->components->pluck('days')->all()); // labour 30d, battery 180d
        $this->assertSame(today()->addDays(179)->toDateString(), $w->end_date->toDateString());
        $this->assertNotNull(Repair::find($id)->signature_path);
        $this->assertStockMatchesMovements();
    }

    public function test_work_needs_customer_approval_and_rejected_job_cannot_proceed(): void
    {
        $job = $this->newJob(['estimate_approved' => false]);
        $this->as($this->manager);
        $this->postJson("/api/repairs/{$job['id']}/status", ['status' => 'in_progress'])->assertStatus(422);
        $this->postJson("/api/repairs/{$job['id']}/approval", ['approved' => false, 'note' => 'Too expensive'])->assertOk();
        $this->postJson("/api/repairs/{$job['id']}/status", ['status' => 'in_progress'])->assertStatus(422);
        $this->postJson("/api/repairs/{$job['id']}/cancel", ['reason' => 'Customer declined'])->assertOk()->assertJsonPath('data.status', 'cancelled');
    }

    public function test_one_open_job_per_imei_and_technician_sees_only_own_jobs(): void
    {
        $job = $this->newJob();
        $this->postJson('/api/repairs', ['customer_id' => $this->customer->id, 'brand' => 'Samsung', 'model' => 'A25', 'imei' => $job['imei'], 'problem' => 'Screen issue', 'terms_accepted' => true])
            ->assertStatus(422);
        $this->as($this->manager)->putJson("/api/repairs/{$job['id']}", ['technician_id' => $this->manager->id])->assertOk();
        $this->as($this->tech)->getJson('/api/repairs')->assertJsonCount(0, 'data');
        $this->getJson("/api/repairs/{$job['id']}")->assertStatus(404);
    }

    public function test_claim_eligibility_follows_terms_not_just_dates(): void
    {
        $this->receiveStock(1);
        $sale = $this->sellPhone();
        $wid = collect($sale['items'])->firstWhere('warranty_id', '!=', null)['warranty_id'];

        $claim = $this->as($this->sales)->postJson('/api/claims', ['warranty_id' => $wid, 'fault' => 'Not charging', 'flags' => ['liquid' => true]])
            ->assertCreated()->assertJsonPath('data.eligible', false)->json('data');
        $this->postJson('/api/claims', ['warranty_id' => $wid, 'fault' => 'again'])->assertStatus(422); // one open claim per warranty
        $this->putJson("/api/claims/{$claim['id']}", ['status' => 'approved'])->assertStatus(403); // sales exec cannot decide
        $this->as($this->manager)->putJson("/api/claims/{$claim['id']}", ['status' => 'approved'])->assertStatus(422);
        $this->putJson("/api/claims/{$claim['id']}", ['status' => 'approved', 'override' => true, 'decision_note' => 'Goodwill'])->assertOk()->assertJsonPath('data.status', 'approved');
    }

    public function test_warranty_replacement_links_both_imeis_and_moves_coverage(): void
    {
        $this->receiveStock(3);
        $old = $this->inStockDevice();
        $sale = $this->sellPhone(null, $old);
        $old->refresh();
        $oldW = Warranty::find($old->warranty_id);

        $claim = $this->as($this->sales)->postJson('/api/claims', ['warranty_id' => $oldW->id, 'fault' => 'Boot loop'])->json('data');
        $this->as($this->manager)->putJson("/api/claims/{$claim['id']}", ['status' => 'approved', 'decision_note' => 'Board failure'])->assertOk();
        $new = $this->inStockDevice();

        $this->as($this->sales)->postJson("/api/claims/{$claim['id']}/replace", ['new_device_id' => $new->id, 'mode' => 'remaining'])->assertStatus(403);
        $this->as($this->manager)->postJson("/api/claims/{$claim['id']}/replace", ['new_device_id' => $old->id, 'mode' => 'remaining'])->assertStatus(422);
        $rep = $this->postJson("/api/claims/{$claim['id']}/replace", ['new_device_id' => $new->id, 'mode' => 'remaining', 'note' => 'RMA to supplier'])
            ->assertCreated()->json('data');

        $old->refresh();
        $new->refresh();
        $this->assertSame('warranty_return', $old->status);
        $this->assertSame($new->id, $old->replaced_by_device_id);
        $this->assertSame('sold', $new->status);
        $this->assertSame($old->id, $new->replacement_of_device_id);
        $this->assertSame($this->customer->id, $new->customer_id);
        $this->assertSame($sale['id'], $new->sale_id);
        $this->assertStringContainsString("Replaced with Samsung Galaxy A15 {$new->imei1}", $old->events()->reorder('id', 'desc')->first()->note);
        $this->assertStringContainsString("replacement for defective {$old->imei1}", $new->events()->reorder('id', 'desc')->first()->note);

        $oldW->refresh();
        $newW = Warranty::find($new->warranty_id);
        $this->assertSame('replaced', $oldW->status);
        $this->assertSame($newW->id, $oldW->replaced_by_warranty_id);
        $this->assertSame($oldW->end_date->toDateString(), $newW->end_date->toDateString()); // remaining period
        $this->assertSame($old->imei1, $newW->replaced_device_code);
        $this->getJson("/api/claims/{$claim['id']}")->assertJsonPath('data.status', 'resolved')->assertJsonPath('data.resolution', 'replacement');
        $this->assertSame(1, Replacement::count());

        // the old warranty can no longer be claimed against
        $this->getJson("/api/warranties/{$oldW->id}")->assertJsonPath('data.state', 'replaced')->assertJsonPath('data.eligibility.eligible', false);
        // look-up by the old IMEI finds both records
        $this->getJson('/api/warranties/lookup?q='.$old->imei1)->assertJsonCount(1, 'data');
        $this->getJson('/api/warranties/lookup?q='.$new->imei1)->assertJsonPath('data.0.replaced_device_code', $old->imei1);

        // defective unit goes back to the supplier (RMA) without touching sellable stock
        $before = Device::where('status', 'in_stock')->count();
        $this->postJson("/api/purchases/{$old->purchase_id}/returns", ['device_ids' => [$old->id], 'reason' => 'RMA defective'])->assertCreated();
        $this->assertSame($before, Device::where('status', 'in_stock')->count());
        $this->assertStockMatchesMovements();
    }

    public function test_staff_must_choose_the_replacement_warranty_period(): void
    {
        $this->receiveStock(4);
        $old = $this->inStockDevice();
        $this->sellPhone(null, $old);
        $claim = $this->as($this->manager)->postJson('/api/claims', ['warranty_id' => $old->fresh()->warranty_id, 'fault' => 'Dead'])->json('data');
        $this->putJson("/api/claims/{$claim['id']}", ['status' => 'approved'])->assertOk();
        $new = $this->inStockDevice();
        $url = "/api/claims/{$claim['id']}/replace";

        $this->postJson($url, ['new_device_id' => $new->id])->assertStatus(422)->assertJsonPath('message', 'Choose the warranty period for the replacement unit.');
        $this->postJson($url, ['new_device_id' => $new->id, 'mode' => 'months'])->assertStatus(422)->assertJsonPath('message', 'Enter the warranty period in months.');
        $this->postJson($url, ['new_device_id' => $new->id, 'mode' => 'date', 'end_date' => today()->subDay()->toDateString()])->assertStatus(422);

        // the manager (no extra permission needed) chooses 6 months
        $this->postJson($url, ['new_device_id' => $new->id, 'mode' => 'months', 'months' => 6])->assertCreated();
        $w = Warranty::find($new->fresh()->warranty_id);
        $this->assertSame(today()->addMonthsNoOverflow(6)->subDay()->toDateString(), $w->end_date->toDateString());
        $this->assertSame('months', $w->mode);
    }

    public function test_replacement_warranty_can_run_until_a_chosen_date(): void
    {
        $this->receiveStock(2);
        $old = $this->inStockDevice();
        $this->sellPhone(null, $old);
        $wid = $old->fresh()->warranty_id;
        $claim = $this->as($this->manager)->postJson('/api/claims', ['warranty_id' => $wid, 'fault' => 'Dead'])->json('data');
        $this->putJson("/api/claims/{$claim['id']}", ['status' => 'approved'])->assertOk();
        $new = $this->inStockDevice();
        $until = today()->addMonths(18)->toDateString();
        $this->as($this->manager)->postJson("/api/claims/{$claim['id']}/replace", ['new_device_id' => $new->id, 'mode' => 'date', 'end_date' => $until])->assertCreated();
        $this->assertSame($until, Warranty::find($new->fresh()->warranty_id)->end_date->toDateString());
    }

    public function test_approved_claim_creates_free_warranty_repair(): void
    {
        $this->receiveStock(1);
        $d = $this->inStockDevice();
        $this->sellPhone(null, $d);
        $claim = $this->as($this->manager)->postJson('/api/claims', ['warranty_id' => $d->fresh()->warranty_id, 'fault' => 'Face ID'])->json('data');
        $this->postJson("/api/claims/{$claim['id']}/repair")->assertStatus(422);
        $this->putJson("/api/claims/{$claim['id']}", ['status' => 'approved'])->assertOk();
        $job = $this->postJson("/api/claims/{$claim['id']}/repair")->assertCreated()->json('data');
        $this->assertTrue(Repair::find($job['id'])->is_warranty_repair);
        $this->getJson("/api/repairs/{$job['id']}")->assertJsonPath('data.totals.total', 0)->assertJsonPath('data.labor_covered', true);
    }
}
