<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\DeviceIdentifier;
use App\Models\Purchase;
use App\Models\StockAdjustment;

class PurchaseAndStockTest extends ShopTestCase
{
    public function test_receiving_registers_each_imei_with_history_and_weighted_average_cost(): void
    {
        $units = $this->receiveStock(3);

        $this->assertSame(3, Device::where('status', 'in_stock')->count());
        $this->assertSame(6, DeviceIdentifier::count()); // IMEI 1 + IMEI 2 each
        $d = Device::where('imei1', $units[0]['imei1'])->first();
        $this->assertSame('Purchased', $d->events()->first()->type);
        $this->assertSame(50, $this->glass->fresh()->qty);

        // second receipt at a higher cost → weighted average
        $this->postJson('/api/purchases', ['supplier_id' => $this->supplier->id, 'status' => 'received', 'items' => [['product_id' => $this->glass->id, 'qty' => 50, 'cost' => 60]]])->assertCreated();
        $this->assertEquals(50.0, $this->glass->fresh()->cost);
        $this->assertStockMatchesMovements();
    }

    public function test_duplicate_and_invalid_imeis_are_blocked(): void
    {
        $units = $this->receiveStock(1);
        $base = ['supplier_id' => $this->supplier->id, 'status' => 'received'];

        // already registered — even when it appears as IMEI 2
        $this->postJson('/api/purchases', $base + ['items' => [['product_id' => $this->phone->id, 'qty' => 1, 'units' => [['imei1' => self::imei(), 'imei2' => $units[0]['imei1']]]]]])
            ->assertStatus(422)->assertJsonFragment(['message' => "{$units[0]['imei1']} is already registered to Samsung Galaxy A15 (In stock). Duplicate IMEI/serial registration is blocked."]);

        // duplicate inside the same receipt
        $x = self::imei();
        $this->postJson('/api/purchases', $base + ['items' => [['product_id' => $this->phone->id, 'qty' => 2, 'units' => [['imei1' => $x], ['imei1' => $x]]]]])
            ->assertStatus(422)->assertJsonPath('message', "Duplicate number in this receipt: $x");

        // check digit
        $this->postJson('/api/purchases', $base + ['items' => [['product_id' => $this->phone->id, 'qty' => 1, 'units' => [['imei1' => '123456789012345']]]]])
            ->assertStatus(422)->assertJsonPath('message', 'Samsung Galaxy A15: “123456789012345” is not a valid 15-digit IMEI (check digit failed).');

        // count mismatch
        $this->postJson('/api/purchases', $base + ['items' => [['product_id' => $this->phone->id, 'qty' => 2, 'units' => [['imei1' => self::imei()]]]]])
            ->assertStatus(422);

        $this->assertSame(1, Device::count()); // nothing half-saved
        $this->assertStockMatchesMovements();
    }

    public function test_purchase_order_then_receive_with_imeis_and_supplier_payable(): void
    {
        $po = $this->as($this->store)->postJson('/api/purchases', ['supplier_id' => $this->supplier->id, 'status' => 'ordered', 'items' => [['product_id' => $this->phone->id, 'qty' => 2, 'cost' => 15000]]])
            ->assertCreated()->assertJsonPath('data.status', 'ordered')->json('data');
        $this->assertSame(0, Device::count());

        $this->postJson("/api/purchases/{$po['id']}/receive", ['supplier_id' => $this->supplier->id, 'status' => 'received', 'paid' => 10000,
            'items' => [['product_id' => $this->phone->id, 'qty' => 2, 'cost' => 15000, 'units' => [['imei1' => self::imei()], ['imei1' => self::imei()]]]]])->assertOk();
        $this->postJson("/api/purchases/{$po['id']}/receive", ['supplier_id' => $this->supplier->id, 'status' => 'received', 'items' => [['product_id' => $this->phone->id, 'qty' => 1, 'units' => [['imei1' => self::imei()]]]]])
            ->assertStatus(422)->assertJsonPath('message', 'This purchase has already been received.');

        $this->as($this->manager)->getJson("/api/purchases/{$po['id']}")->assertJsonPath('data.balance', 20000);
        $this->postJson("/api/purchases/{$po['id']}/payments", ['amount' => 30000, 'method' => 'Bank Transfer'])->assertStatus(422);
        $this->postJson("/api/purchases/{$po['id']}/payments", ['amount' => 20000, 'method' => 'Bank Transfer'])->assertCreated();
        $this->getJson("/api/purchases/{$po['id']}")->assertJsonPath('data.balance', 0);
    }

    public function test_store_keeper_adjustment_needs_manager_approval(): void
    {
        $this->receiveStock(1);
        $adj = $this->as($this->store)->postJson('/api/adjustments', ['product_id' => $this->glass->id, 'qty' => -3, 'type' => 'Damaged', 'reason' => 'Cracked on display'])
            ->assertCreated()->assertJsonPath('data.status', 'pending')->json('data');
        $this->assertSame(50, $this->glass->fresh()->qty);
        $this->postJson("/api/adjustments/{$adj['id']}/approve")->assertStatus(403);

        $this->as($this->manager)->postJson("/api/adjustments/{$adj['id']}/approve")->assertOk()->assertJsonPath('data.status', 'approved');
        $this->assertSame(47, $this->glass->fresh()->qty);

        // cannot go negative
        $this->postJson('/api/adjustments', ['product_id' => $this->glass->id, 'qty' => -100, 'type' => 'Missing', 'reason' => 'Count'])->assertStatus(422);
        $this->assertSame(1, StockAdjustment::count());
        $this->assertStockMatchesMovements();
    }

    public function test_store_keeper_cannot_sell_or_see_sales(): void
    {
        $this->receiveStock(1);
        $this->as($this->store)->getJson('/api/sales')->assertStatus(403);
        $this->postJson('/api/sales', ['items' => [['product_id' => $this->glass->id, 'qty' => 1]]])->assertStatus(403);
        $this->assertSame(1, Purchase::count());
    }
}
