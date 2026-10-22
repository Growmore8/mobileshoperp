<?php

namespace Tests\Feature;

use App\Models\Role;

class ReportsAndDocumentsTest extends ShopTestCase
{
    private function period(): string
    {
        return '?from='.today()->subDays(30)->toDateString().'&to='.today()->toDateString();
    }

    public function test_every_report_returns_kpis_and_sections_for_a_manager(): void
    {
        $this->receiveStock(2);
        $this->sellPhone($this->sales);
        $this->as($this->manager);
        foreach (['sales', 'inventory', 'repairs', 'warranty', 'financial'] as $type) {
            $r = $this->getJson("/api/reports/$type".$this->period())->assertOk()->json();
            $this->assertNotEmpty($r['kpis'], $type);
            $this->assertNotEmpty($r['sections'], $type);
            foreach ($r['sections'] as $s) {
                $this->assertCount(count($s['headers']), $s['formats'], "$type: {$s['title']}");
            }
        }
        $sales = $this->getJson('/api/reports/sales'.$this->period())->json();
        $this->assertEquals(18597, $sales['kpis'][0]['value']); // net sales = phone + 2 screen guards
        $this->assertSame('Gross profit', collect($sales['kpis'])->last()['label']);
    }

    public function test_reports_respect_financial_permissions(): void
    {
        $this->receiveStock(1);
        $role = Role::where('name', 'Technician')->first();
        $role->update(['permissions' => $role->permissions + ['reports' => ['view']]]);
        $this->as($this->tech);

        $this->getJson('/api/reports/financial'.$this->period())->assertStatus(403);
        $inv = $this->getJson('/api/reports/inventory'.$this->period())->assertOk()->json();
        $this->assertNotContains('Stock valuation (cost)', array_column($inv['kpis'], 'label'));
        $sales = $this->getJson('/api/reports/sales'.$this->period())->json();
        $this->assertNotContains('Gross profit', array_column($sales['kpis'], 'label'));

        $this->as($this->sales)->getJson('/api/reports/sales'.$this->period())->assertStatus(403);
        $this->as($this->manager)->getJson('/api/reports/nonsense'.$this->period())->assertStatus(404);
        $this->getJson('/api/reports/sales?from=2026-01-10&to=2026-01-01')->assertStatus(422);
    }

    public function test_pdf_documents_download_with_the_same_visibility_rules(): void
    {
        $this->receiveStock(2);
        $mine = $this->sellPhone($this->sales);
        $other = $this->sellPhone($this->manager);

        $this->as($this->sales);
        $res = $this->get("/api/documents/invoice/{$mine['id']}")->assertOk();
        $this->assertSame('application/pdf', $res->headers->get('content-type'));
        $this->assertStringStartsWith('%PDF', $res->getContent());
        $this->getJson("/api/documents/invoice/{$other['id']}")->assertStatus(404); // another staff member's invoice
        $wid = collect($mine['items'])->firstWhere('warranty_id', '!=', null)['warranty_id'];
        $this->get("/api/documents/warranty/$wid")->assertOk();

        $job = $this->postJson('/api/repairs', ['customer_id' => $this->customer->id, 'brand' => 'Apple', 'model' => 'iPhone 12', 'imei' => self::imei(), 'problem' => 'Cracked back', 'terms_accepted' => true])->json('data');
        $this->get("/api/documents/repair/{$job['id']}?kind=receipt")->assertOk();
        $this->getJson("/api/documents/repair/{$job['id']}?kind=delivery")->assertStatus(422);

        $this->as($this->manager);
        $this->get("/api/documents/statement/{$this->customer->id}")->assertOk();
        $pur = \App\Models\Purchase::first();
        $this->get("/api/documents/purchase/{$pur->id}")->assertOk();
        $this->as($this->tech)->getJson("/api/documents/purchase/{$pur->id}")->assertStatus(403);
        $this->getJson("/api/documents/statement/{$this->customer->id}")->assertStatus(403); // technician: no customers.print
    }
}
