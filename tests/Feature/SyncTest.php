<?php

namespace Tests\Feature;

use App\Models\Repair;
use Illuminate\Support\Facades\URL;

class SyncTest extends ShopTestCase
{
    public function test_full_sync_returns_ui_shapes_filtered_by_role(): void
    {
        $this->receiveStock(2);
        $mine = $this->sellPhone($this->sales);
        $this->sellPhone($this->manager);

        // manager: everything, with costs
        $m = $this->as($this->manager)->getJson('/api/sync')->assertOk()->assertJsonPath('full', true)->json();
        $this->assertCount(2, $m['sales']);
        $this->assertArrayHasKey('cost', $m['products'][0]);
        $this->assertSame('Singtel Mobile', $m['settings']['shopName']);
        $this->assertSame((string) $this->phone->id, $m['products'][0]['id']); // string ids, camelCase keys
        $this->assertTrue($m['products'][0]['serialized']);
        $sale = collect($m['sales'])->firstWhere('id', (string) $mine['id']);
        $this->assertNotEmpty($sale['items'][0]['warrantyId']);
        $this->assertSame('Sold', collect($m['devices'])->firstWhere('status', 'sold')['history'][1]['type']);

        // sales executive: own invoices only, no cost data, no purchases / expenses / activity
        $s = $this->as($this->sales)->getJson('/api/sync')->json();
        $this->assertCount(1, $s['sales']);
        $this->assertSame((string) $mine['id'], $s['sales'][0]['id']);
        $this->assertArrayNotHasKey('cost', $s['products'][0]);
        $this->assertArrayNotHasKey('cost', $s['sales'][0]['items'][0]);
        $this->assertArrayNotHasKey('purchases', $s);
        $this->assertArrayNotHasKey('expenses', $s);
        $this->assertArrayNotHasKey('activity', $s);

        // technician: no sales at all
        $t = $this->as($this->tech)->getJson('/api/sync')->json();
        $this->assertArrayNotHasKey('sales', $t);
        $this->assertArrayHasKey('repairs', $t);
    }

    public function test_incremental_sync_returns_only_changed_records_including_parent_of_new_payment(): void
    {
        $this->receiveStock(1);
        $this->as($this->manager);
        $sale = $this->postJson('/api/sales', ['customer_id' => $this->customer->id, 'items' => [['product_id' => $this->glass->id, 'qty' => 1]], 'payments' => [], 'allow_credit' => true])->json('data');
        $since = now()->addSecond()->toIso8601String();
        $this->travel(2)->seconds();

        $delta = $this->getJson('/api/sync?since='.urlencode($since))->assertJsonPath('full', false)->json();
        $this->assertSame([], $delta['sales']);

        $this->postJson("/api/sales/{$sale['id']}/payments", ['amount' => 100, 'method' => 'Cash'])->assertCreated();
        $delta = $this->getJson('/api/sync?since='.urlencode($since))->json();
        $this->assertCount(1, $delta['sales']); // the payment touched its invoice
        $this->assertEquals(100, collect($delta['sales'][0]['payments'])->sum('amount'));
    }

    public function test_photos_and_signatures_need_a_valid_signed_link(): void
    {
        $this->receiveStock(1);
        $job = $this->as($this->sales)->postJson('/api/repairs', ['customer_id' => $this->customer->id, 'brand' => 'Apple', 'model' => 'iPhone 12', 'imei' => self::imei(), 'problem' => 'Cracked back', 'terms_accepted' => true])->json('data');
        $this->postJson("/api/repairs/{$job['id']}/photos", ['photo' => $this->png()])->assertStatus(403); // sales cannot edit repairs
        $this->as($this->tech)->postJson("/api/repairs/{$job['id']}/photos", ['photo' => $this->png()])->assertCreated();

        $url = collect($this->as($this->manager)->getJson('/api/sync')->json('repairs'))->firstWhere('id', (string) $job['id'])['photos'][0];
        $this->get($url)->assertOk();
        $attachment = Repair::find($job['id'])->attachments()->first();
        $this->get('/files/'.$attachment->id)->assertStatus(403); // unsigned
        $this->get(URL::temporarySignedRoute('files.show', now()->subMinute(), ['attachment' => $attachment->id]))->assertStatus(403); // expired
    }

    /** A real 1×1 PNG (works without the GD extension). */
    private function png(): \Illuminate\Http\UploadedFile
    {
        return \Illuminate\Http\UploadedFile::fake()->createWithContent('front.png', base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='));
    }

    public function test_meta_hides_demo_accounts_unless_demo_mode(): void
    {
        config(['shop.demo' => false]);
        $this->getJson('/api/meta')->assertOk()->assertJsonPath('demo', false)->assertJsonPath('demo_accounts', []);
        config(['shop.demo' => true]);
        $accounts = $this->getJson('/api/meta')->assertJsonPath('demo', true)->json('demo_accounts');
        $this->assertSame('admin', $accounts[0]['username']); // only the base admin exists in this test database
    }

    public function test_demo_reset_is_refused_in_production_and_for_non_admins(): void
    {
        config(['shop.demo' => false]);
        $this->as($this->admin)->postJson('/api/demo/reset')->assertStatus(403);
        config(['shop.demo' => true]);
        $this->as($this->manager)->postJson('/api/demo/reset')->assertStatus(403);
    }
}
