<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Customer;
use App\Models\Device;
use App\Models\Product;
use App\Models\StockMovement;
use App\Models\Supplier;
use App\Models\User;
use App\Support\Imei;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Shared fixtures for workflow tests: a phone, an accessory, a spare part, a supplier, a customer and staff. */
abstract class ShopTestCase extends TestCase
{
    use RefreshDatabase;

    protected User $admin;

    protected User $manager;

    protected User $sales;

    protected User $tech;

    protected User $store;

    protected Product $phone;

    protected Product $glass;

    protected Product $battery;

    protected Supplier $supplier;

    protected Customer $customer;

    private static int $imeiSeq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        $this->admin = User::where('username', 'admin')->first();
        $this->manager = User::factory()->role('Store Manager')->create(['name' => 'Priya']);
        $this->sales = User::factory()->role('Sales Executive')->create(['name' => 'Kevin']);
        $this->tech = User::factory()->role('Technician')->create(['name' => 'Rohan']);
        $this->store = User::factory()->role('Store Keeper')->create(['name' => 'Sameer']);

        $phones = Category::where('name', 'Mobile Phones')->value('id');
        $this->supplier = Supplier::create(['code' => 'S-1', 'name' => 'Metro Mobile Distributors']);
        $this->phone = Product::create(['code' => 'P-1', 'name' => 'Samsung Galaxy A15', 'brand' => 'Samsung', 'model' => 'Galaxy A15', 'category_id' => $phones, 'tracking' => 'imei', 'cost' => 15500, 'price' => 17999, 'warranty_months' => 12, 'warranty_provider' => 'Manufacturer', 'min_stock' => 1]);
        $this->glass = Product::create(['code' => 'P-2', 'name' => 'Tempered Glass', 'category_id' => Category::where('name', 'Cases & Protection')->value('id'), 'tracking' => 'qty', 'cost' => 40, 'price' => 299]);
        $this->battery = Product::create(['code' => 'P-3', 'name' => 'A-Series Battery', 'category_id' => Category::where('name', 'Spare Parts')->value('id'), 'tracking' => 'qty', 'cost' => 900, 'price' => 1900, 'repair_warranty_days' => 180]);
        $this->customer = Customer::create(['code' => 'C-1', 'name' => 'Ishara Fernando', 'phone' => '077 245 1180', 'phone_digits' => '0772451180']);
    }

    protected function as(User $u): static
    {
        Sanctum::actingAs($u->fresh());

        return $this;
    }

    protected static function imei(): string
    {
        $body = '35467611'.str_pad((string) (++self::$imeiSeq + random_int(0, 899) * 1000), 6, '0', STR_PAD_LEFT);

        return $body.Imei::checkDigit($body);
    }

    /** Receive $n phones (dual IMEI) + glass + batteries through the real API. */
    protected function receiveStock(int $n = 3): array
    {
        $units = array_map(fn () => ['imei1' => self::imei(), 'imei2' => self::imei()], range(1, $n));
        $this->as($this->store)->postJson('/api/purchases', [
            'supplier_id' => $this->supplier->id, 'status' => 'received', 'supplier_invoice' => 'MMD-1',
            'items' => [
                ['product_id' => $this->phone->id, 'qty' => $n, 'cost' => 15500, 'units' => $units],
                ['product_id' => $this->glass->id, 'qty' => 50, 'cost' => 40],
                ['product_id' => $this->battery->id, 'qty' => 5, 'cost' => 900],
            ],
        ])->assertCreated();

        return $units;
    }

    protected function inStockDevice(): Device
    {
        return Device::where('product_id', $this->phone->id)->where('status', 'in_stock')->firstOrFail();
    }

    protected function sellPhone(?User $as = null, ?Device $d = null): array
    {
        $d ??= $this->inStockDevice();

        return $this->as($as ?? $this->sales)->postJson('/api/sales', [
            'customer_id' => $this->customer->id,
            'items' => [['product_id' => $this->phone->id, 'device_id' => $d->id, 'qty' => 1, 'price' => 17999, 'warranty_months' => 12], ['product_id' => $this->glass->id, 'qty' => 2, 'price' => 299]],
            'payments' => [['method' => 'Cash', 'amount' => 20000]],
        ])->assertCreated()->json('data');
    }

    /** Stock on hand must always equal the sum of recorded movements. */
    protected function assertStockMatchesMovements(): void
    {
        foreach (Product::all() as $p) {
            $onHand = $p->tracking === 'qty' ? $p->qty : Device::where('product_id', $p->id)->where('status', 'in_stock')->count();
            $this->assertSame((int) $onHand, (int) StockMovement::where('product_id', $p->id)->sum('qty'), "Stock / movement mismatch for {$p->name}");
        }
    }
}
