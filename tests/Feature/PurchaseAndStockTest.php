<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\DeviceIdentifier;
use App\Models\Product;
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

    public function test_product_with_models_keeps_price_and_stock_per_model(): void
    {
        $this->as($this->admin);
        $cat = \App\Models\Category::where('name', 'Cases & Protection')->value('id');
        $group = $this->postJson('/api/products', ['name' => 'Back covers', 'code' => 'P-1001', 'category_id' => $cat, 'brand' => 'Pastel', 'tracking' => 'qty', 'price' => 0,
            'models' => [['variant' => 'iPhone 11', 'price' => 1390, 'cost' => 280], ['variant' => 'iPhone 12', 'price' => 1450, 'cost' => 300, 'barcode' => '8901001']]])
            ->assertCreated()->assertJsonPath('data.has_models', true)->json('data');
        $m11 = Product::where('parent_id', $group['id'])->where('variant', 'iPhone 11')->first();
        $m12 = Product::where('barcode', '8901001')->first();
        $this->assertSame('Back covers – iPhone 11', $m11->name);
        $this->assertSame(['P-1001-01', 'P-1001-02'], [$m11->code, $m12->code]);
        $this->assertSame('Pastel', $m12->brand);
        $this->assertEquals(1390, $group['price']); // "from" price

        // receiving and selling happen per model; the group itself holds no stock
        $base = ['supplier_id' => $this->supplier->id, 'status' => 'received'];
        $this->postJson('/api/purchases', $base + ['items' => [['product_id' => $group['id'], 'qty' => 5, 'cost' => 280]]])
            ->assertStatus(422)->assertJsonPath('message', 'Back covers has several models — choose the model (for example Back covers – …).');
        $this->postJson('/api/purchases', $base + ['items' => [['product_id' => $m11->id, 'qty' => 5, 'cost' => 280], ['product_id' => $m12->id, 'qty' => 3, 'cost' => 300]]])->assertCreated();
        $this->assertSame([5, 3], [$m11->fresh()->qty, $m12->fresh()->qty]);
        $this->postJson('/api/sales', ['items' => [['product_id' => $m12->id, 'qty' => 1]], 'payments' => [['method' => 'Cash', 'amount' => 1450]]])
            ->assertCreated();
        $this->assertSame('Back covers – iPhone 12', \App\Models\SaleItem::latest('id')->value('name'));
        $this->assertSame(2, $m12->fresh()->qty);
        $this->assertEquals(7, collect($this->getJson('/api/products?q=Back')->json('data'))->firstWhere('id', $group['id'])['stock']);

        // renaming the product renames its models; a removed model with history is deactivated, not deleted
        $this->putJson("/api/products/{$group['id']}", ['name' => 'Back cover', 'category_id' => $cat, 'tracking' => 'qty', 'price' => 0,
            'models' => [['id' => $m11->id, 'variant' => 'iPhone 11', 'price' => 1500], ['variant' => 'iPhone 15 Pro Max', 'price' => 1800]]])->assertOk();
        $this->assertSame(['Back cover – iPhone 11', 1500.0], [$m11->fresh()->name, $m11->fresh()->price]);
        $this->assertFalse($m12->fresh()->active);
        $this->assertSame('P-1001-03', Product::where('variant', 'iPhone 15 Pro Max')->value('code'));

        // switching the product off switches its models off; switching it back on brings them back
        $edit = fn (bool $on) => $this->putJson("/api/products/{$group['id']}", ['name' => 'Back cover', 'category_id' => $cat, 'tracking' => 'qty', 'price' => 0, 'active' => $on,
            'models' => [['id' => $m11->id, 'variant' => 'iPhone 11', 'price' => 1500], ['id' => Product::where('variant', 'iPhone 15 Pro Max')->value('id'), 'variant' => 'iPhone 15 Pro Max', 'price' => 1800]]])->assertOk();
        $edit(false);
        $this->assertFalse($m11->fresh()->active);
        $edit(true);
        $this->assertTrue($m11->fresh()->active);
        $this->assertFalse($m12->fresh()->active); // removed earlier, stays removed
        $this->assertSame(1, \App\Models\ActivityLog::where('action', 'Product deactivated')->where('detail', 'like', '%iPhone 12%')->count());

        // a product that already has its own stock cannot become a group
        $this->receiveStock(1);
        $this->as($this->admin)->putJson("/api/products/{$this->battery->id}", ['name' => 'A-Series Battery', 'category_id' => $cat, 'tracking' => 'qty', 'price' => 1900, 'models' => [['variant' => 'A15', 'price' => 1900]]])
            ->assertStatus(422);
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
