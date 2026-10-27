<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\Sale;
use App\Models\Warranty;

class SalesTest extends ShopTestCase
{
    public function test_phone_sale_deducts_stock_links_customer_and_registers_warranty(): void
    {
        $this->receiveStock(2);
        $d = $this->inStockDevice();
        $sale = $this->sellPhone(null, $d);

        $this->assertEquals(18597, $sale['total']);
        $this->assertEquals(1403, $sale['change_given']);
        $this->assertEquals(0, $sale['balance']);
        $d->refresh();
        $this->assertSame('sold', $d->status);
        $this->assertSame($this->customer->id, $d->customer_id);
        $w = Warranty::find($d->warranty_id);
        $this->assertSame('product', $w->kind);
        $this->assertSame(today()->addMonthsNoOverflow(12)->subDay()->toDateString(), $w->end_date->toDateString());
        $this->assertSame($sale['no'], $w->invoice_no);
        $this->assertSame(48, $this->glass->fresh()->qty);
        $this->assertStockMatchesMovements();
    }

    public function test_seller_must_choose_phone_warranty_which_starts_on_the_sale_date(): void
    {
        $this->receiveStock(3);
        $this->as($this->sales);
        $d = $this->inStockDevice();
        $this->postJson('/api/sales', ['items' => [['product_id' => $this->phone->id, 'device_id' => $d->id, 'qty' => 1]], 'payments' => [['method' => 'Cash', 'amount' => 17999]]])
            ->assertStatus(422)->assertJsonPath('message', "Samsung Galaxy A15 ({$d->imei1}): select the warranty period.");

        // 6 months chosen by the seller (product standard is 12)
        $sale = $this->postJson('/api/sales', ['items' => [['product_id' => $this->phone->id, 'device_id' => $d->id, 'qty' => 1, 'warranty_months' => 6]], 'payments' => [['method' => 'Cash', 'amount' => 17999]]])
            ->assertCreated()->json('data');
        $w = Warranty::find($sale['items'][0]['warranty_id']);
        $this->assertSame(6, $w->months);
        $this->assertSame(today()->toDateString(), $w->start_date->toDateString());
        $this->assertSame(today()->addMonthsNoOverflow(6)->subDay()->toDateString(), $w->end_date->toDateString());
        $this->assertStringContainsString('selected at sale', $w->events()->first()->note);

        // "No warranty" is an explicit choice
        $d2 = $this->inStockDevice();
        $sale2 = $this->postJson('/api/sales', ['items' => [['product_id' => $this->phone->id, 'device_id' => $d2->id, 'qty' => 1, 'warranty_months' => 0]], 'payments' => [['method' => 'Cash', 'amount' => 17999]]])
            ->assertCreated()->json('data');
        $this->assertNull($sale2['items'][0]['warranty_id']);
    }

    public function test_percentage_discount_and_vat_switch(): void
    {
        $this->receiveStock(3);
        $this->as($this->manager);
        $sell = fn (array $extra) => $this->postJson('/api/sales', $extra + ['items' => [['product_id' => $this->phone->id, 'device_id' => $this->inStockDevice()->id, 'qty' => 1, 'warranty_months' => 12]],
            'payments' => [['method' => 'Cash', 'amount' => 17999]]])->assertCreated()->json('data');

        // 10% off a Rs. 17,999 phone; VAT on (8% inclusive) — the sale keeps the rate it was billed at
        $s = $sell(['discount_percent' => 10]);
        $this->assertEquals(1799.9, $s['discount']);
        $this->assertEquals(10, $s['discount_percent']);
        $this->assertEquals(16199.1, $s['total']);
        $this->assertEquals(8, $s['tax_rate']);
        $this->assertGreaterThan(0, $s['tax']);

        // VAT switched off: nothing charged, rate recorded as 0, older invoice unchanged
        \App\Models\Setting::put('tax_enabled', false);
        $s2 = $sell(['discount' => 999]);
        $this->assertEquals(0, $s2['tax']);
        $this->assertEquals(0, $s2['tax_rate']);
        $this->assertNull($s2['discount_percent']);
        $this->assertEquals(17000, $s2['total']);
        $this->assertEquals(8, Sale::where('no', $s['no'])->value('tax_rate'));
        $this->get("/api/documents/invoice/{$s2['id']}")->assertOk();

        // percentage discounts follow the same POS permission as amount discounts
        $this->as($this->sales);
        $this->postJson('/api/sales', ['discount_percent' => 5, 'items' => [['product_id' => $this->phone->id, 'device_id' => $this->inStockDevice()->id, 'qty' => 1, 'warranty_months' => 12]],
            'payments' => [['method' => 'Cash', 'amount' => 17999]]])->assertStatus(403);
        $this->postJson('/api/sales', ['discount_percent' => 150, 'items' => []])->assertStatus(422);
    }

    public function test_sale_guards(): void
    {
        $this->receiveStock(1);
        $d = $this->inStockDevice();
        $this->as($this->sales);
        // price override without POS edit permission
        $this->postJson('/api/sales', ['items' => [['product_id' => $this->glass->id, 'qty' => 1, 'price' => 100]], 'payments' => [['method' => 'Cash', 'amount' => 100]]])->assertStatus(403);
        // same IMEI twice
        $this->postJson('/api/sales', ['items' => [['product_id' => $this->phone->id, 'device_id' => $d->id, 'qty' => 1], ['product_id' => $this->phone->id, 'device_id' => $d->id, 'qty' => 1]], 'payments' => [['method' => 'Cash', 'amount' => 40000]]])->assertStatus(422);
        // more than in stock
        $this->postJson('/api/sales', ['items' => [['product_id' => $this->glass->id, 'qty' => 51]], 'payments' => [['method' => 'Cash', 'amount' => 99999]]])->assertStatus(422);
        // credit needs a customer and confirmation
        $this->postJson('/api/sales', ['items' => [['product_id' => $this->glass->id, 'qty' => 1]], 'payments' => [['method' => 'Cash', 'amount' => 100]]])
            ->assertStatus(422)->assertJsonPath('message', 'Partial payment / credit requires a registered customer (not walk-in).');
        $this->postJson('/api/sales', ['customer_id' => $this->customer->id, 'items' => [['product_id' => $this->glass->id, 'qty' => 1]], 'payments' => [['method' => 'Card', 'amount' => 100]], 'allow_credit' => true])
            ->assertCreated()->assertJsonPath('data.balance', 199);
        // over-payment by card is not allowed
        $this->postJson('/api/sales', ['items' => [['product_id' => $this->glass->id, 'qty' => 1]], 'payments' => [['method' => 'Card', 'amount' => 500]]])->assertStatus(422);
        $this->assertSame(1, Sale::count());
        $this->assertStockMatchesMovements();
    }

    public function test_sales_exec_sees_only_own_invoices(): void
    {
        $this->receiveStock(2);
        $mine = $this->sellPhone($this->sales);
        $other = $this->sellPhone($this->manager);
        $this->as($this->sales)->getJson('/api/sales')->assertJsonCount(1, 'data');
        $this->getJson("/api/sales/{$other['id']}")->assertStatus(404);
        $this->getJson("/api/sales/{$mine['id']}")->assertOk()->assertJsonMissingPath('data.items.0.cost');
    }

    public function test_refund_restocks_voids_warranty_and_refunds_money_with_permission(): void
    {
        $this->receiveStock(1);
        $sale = $this->sellPhone();
        $phoneLine = collect($sale['items'])->firstWhere('device_id', '!=', null);

        $this->as($this->sales)->postJson("/api/sales/{$sale['id']}/refunds", ['lines' => [['item_id' => $phoneLine['id'], 'qty' => 1]], 'reason' => 'Changed mind', 'restock' => 'stock', 'method' => 'Cash'])
            ->assertStatus(403);

        $this->as($this->manager)->postJson("/api/sales/{$sale['id']}/refunds", ['lines' => [['item_id' => $phoneLine['id'], 'qty' => 1]], 'reason' => 'Changed mind', 'restock' => 'stock', 'method' => 'Cash'])
            ->assertCreated()->assertJsonPath('data.refund', 17999);
        $d = Device::find($phoneLine['device_id']);
        $this->assertSame('in_stock', $d->status);
        $this->assertNull($d->customer_id);
        $this->assertSame('void', Warranty::find($phoneLine['warranty_id'])->status);
        $this->getJson("/api/sales/{$sale['id']}")->assertJsonPath('data.status', 'partially_refunded')->assertJsonPath('data.balance', 0);
        $this->assertStockMatchesMovements();
    }

    public function test_cancel_restores_everything_and_keeps_the_record(): void
    {
        $this->receiveStock(1);
        $sale = $this->sellPhone();
        $this->as($this->manager)->postJson("/api/sales/{$sale['id']}/cancel", ['reason' => 'Wrong customer'])->assertOk()->assertJsonPath('data.status', 'cancelled');
        $this->assertSame(1, Device::where('status', 'in_stock')->count());
        $this->assertSame(50, $this->glass->fresh()->qty);
        $this->postJson("/api/sales/{$sale['id']}/cancel", ['reason' => 'again'])->assertStatus(422);
        $this->assertDatabaseHas('sales', ['id' => $sale['id'], 'status' => 'cancelled']);
        $this->assertStockMatchesMovements();
    }

    public function test_customer_account_payment_applies_to_oldest_invoice_first(): void
    {
        $this->receiveStock(1);
        $this->as($this->manager);
        foreach ([1, 2] as $_) {
            $this->postJson('/api/sales', ['customer_id' => $this->customer->id, 'items' => [['product_id' => $this->glass->id, 'qty' => 2]], 'payments' => [], 'allow_credit' => true])->assertCreated();
        }
        $this->postJson("/api/customers/{$this->customer->id}/payments", ['amount' => 1300, 'method' => 'Cash'])->assertStatus(422); // owes 2 x 598 = 1196
        $applied = $this->postJson("/api/customers/{$this->customer->id}/payments", ['amount' => 700, 'method' => 'Cash'])->assertOk()->json('applied');
        $this->assertCount(2, $applied);
        $this->getJson("/api/customers/{$this->customer->id}")->assertJsonPath('related.balance', 496);
    }
}
