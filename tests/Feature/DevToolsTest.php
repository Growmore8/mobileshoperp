<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Purchase;
use App\Models\Sale;
use App\Models\User;
use App\Models\Warranty;

class DevToolsTest extends ShopTestCase
{
    private function developer(): User
    {
        return User::factory()->role('Administrator')->create(['username' => 'growmore', 'name' => 'Grow More Support']);
    }

    public function test_only_the_developer_can_permanently_delete(): void
    {
        $this->receiveStock(1);
        $sale = $this->sellPhone();

        $this->as($this->admin)->deleteJson("/api/dev/sale/{$sale['id']}")->assertForbidden();
        $this->as($this->admin)->getJson('/api/sync')->assertJsonPath('me.developer', false);
        $this->as($this->developer())->getJson('/api/sync')->assertJsonPath('me.developer', true);
    }

    public function test_deleting_a_sale_puts_its_stock_back_and_removes_warranty_and_payments(): void
    {
        $units = $this->receiveStock(2);
        $sale = $this->sellPhone();
        $d = Device::where('sale_id', $sale['id'])->first();
        $this->assertSame(48, $this->glass->fresh()->qty);

        $this->as($this->developer())->deleteJson("/api/dev/sale/{$sale['id']}")->assertOk()->assertJsonPath('deleted', "Sale {$sale['no']}");

        $this->assertNull(Sale::find($sale['id']));
        $this->assertSame('in_stock', $d->fresh()->status);
        $this->assertNull($d->fresh()->customer_id);
        $this->assertSame(50, $this->glass->fresh()->qty);
        $this->assertSame(0, Warranty::count());
        $this->assertSame(0, Payment::count());
        $this->assertStockMatchesMovements();
    }

    public function test_a_purchase_whose_stock_was_sold_must_wait_for_the_sale(): void
    {
        $this->receiveStock(1);
        $sale = $this->sellPhone();
        $p = Purchase::first();
        $dev = $this->developer();

        $this->as($dev)->deleteJson("/api/dev/purchase/{$p->id}")->assertStatus(422);
        $this->as($dev)->deleteJson("/api/dev/sale/{$sale['id']}")->assertOk();
        $this->as($dev)->deleteJson("/api/dev/purchase/{$p->id}")->assertOk();

        $this->assertSame(0, Device::count());
        $this->assertSame(0, $this->glass->fresh()->qty);
        $this->assertSame(0, $this->battery->fresh()->qty);
        $this->assertStockMatchesMovements();

        // nothing uses the product any more, so it can go too
        $this->as($dev)->deleteJson("/api/dev/product/{$this->phone->id}")->assertOk();
        $this->assertNull(Product::find($this->phone->id));
    }

    public function test_clear_test_data_keeps_users_settings_and_categories(): void
    {
        $this->receiveStock(1);
        $this->sellPhone();

        $this->artisan('shop:clear-test-data')->assertExitCode(1);
        $this->assertSame(1, Sale::count());

        $this->artisan('shop:clear-test-data', ['--confirm' => 'DELETE'])->assertExitCode(0);
        $this->assertSame(0, Sale::count() + Purchase::count() + Product::count() + Device::count());
        $this->assertSame(0, \App\Models\Customer::count() + \App\Models\Supplier::count());
        $this->assertGreaterThan(0, User::count());
        $this->assertGreaterThan(0, \App\Models\Category::count());
        $this->assertGreaterThan(0, \App\Models\Setting::count());
    }
}
