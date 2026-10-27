<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Services\DocNumber;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AccessControlTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    public function test_sales_executive_is_blocked_from_users_settings_and_logs_the_attempt(): void
    {
        Sanctum::actingAs(User::factory()->role('Sales Executive')->create());

        $this->getJson('/api/users')->assertStatus(403)
            ->assertJsonPath('message', 'Access denied — your role does not have “View” permission for Users, Roles & Logs.');
        $this->putJson('/api/settings', ['tax_rate' => 0])->assertStatus(403);
        $this->assertDatabaseHas('activity_logs', ['action' => 'Access denied']);
    }

    public function test_manager_can_view_users_but_not_change_roles(): void
    {
        Sanctum::actingAs(User::factory()->role('Store Manager')->create());
        $this->getJson('/api/users')->assertOk();
        $role = Role::where('name', 'Technician')->first();
        $this->putJson("/api/roles/{$role->id}", ['name' => 'Technician', 'permissions' => []])->assertStatus(403);
    }

    public function test_admin_edits_role_permissions_with_sanitising_and_audit_diff(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $role = Role::where('name', 'Sales Executive')->first();

        $this->putJson("/api/roles/{$role->id}", [
            'name' => 'Sales Executive',
            'permissions' => ['sales' => ['refund'], 'settings' => ['manage'], 'bogus' => ['view']],
        ])->assertOk();

        $role->refresh();
        $this->assertSame(['view', 'refund'], $role->permissions['sales']); // refund implies view
        $this->assertArrayNotHasKey('bogus', $role->permissions);
        $this->assertDatabaseHas('activity_logs', ['action' => 'Permissions changed']);
    }

    public function test_permission_change_applies_immediately_to_signed_in_users(): void
    {
        $tech = User::factory()->role('Technician')->create();
        Sanctum::actingAs($tech);
        $this->getJson('/api/activity')->assertStatus(403);

        $role = $tech->role;
        $role->update(['permissions' => array_merge($role->permissions, ['users' => ['view']])]);
        $tech->refresh();
        Sanctum::actingAs($tech);
        $this->getJson('/api/activity')->assertOk();
    }

    public function test_administrator_role_cannot_be_edited_or_deleted(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $admin = Role::where('is_admin', true)->first();
        $this->putJson("/api/roles/{$admin->id}", ['name' => 'X'])->assertStatus(422);
        $this->deleteJson("/api/roles/{$admin->id}")->assertStatus(422);
    }

    public function test_role_in_use_cannot_be_deleted(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        User::factory()->role('Technician')->create();
        $this->deleteJson('/api/roles/'.Role::where('name', 'Technician')->value('id'))
            ->assertStatus(422)->assertJsonPath('message', 'Reassign the users of this role before deleting it.');
    }

    public function test_admin_manages_staff_accounts_with_safety_rules(): void
    {
        $me = User::where('username', 'admin')->first();
        Sanctum::actingAs($me);
        $salesRole = Role::where('name', 'Sales Executive')->value('id');

        $id = $this->postJson('/api/users', ['name' => 'Ayesha Rahman', 'username' => 'Ayesha', 'password' => 'longpassword', 'role_id' => $salesRole])
            ->assertCreated()->assertJsonPath('data.username', 'ayesha')->json('data.id');

        $this->postJson('/api/users', ['name' => 'Dup', 'username' => 'ayesha', 'password' => 'longpassword', 'role_id' => $salesRole])->assertStatus(422);
        $this->postJson('/api/users', ['name' => 'Weak', 'username' => 'weak', 'password' => 'short', 'role_id' => $salesRole])->assertStatus(422);

        // cannot deactivate yourself or remove the last admin
        $this->patchJson("/api/users/{$me->id}/active", ['active' => false])->assertStatus(422);
        $this->putJson("/api/users/{$me->id}", ['name' => 'Admin', 'username' => 'admin', 'role_id' => $salesRole])
            ->assertStatus(422)->assertJsonPath('message', 'You cannot change your own role.');

        $this->patchJson("/api/users/{$id}/active", ['active' => false])->assertOk()->assertJsonPath('data.active', false);
        $this->postJson('/api/auth/login', ['username' => 'ayesha', 'password' => 'longpassword'])->assertStatus(403);
    }

    public function test_settings_update_validates_and_logs_changed_keys(): void
    {
        $admin = User::where('username', 'admin')->first();
        $admin->update(['password' => 'owner-pass-2026']);
        Sanctum::actingAs($admin);
        // Settings need the password re-entered first
        $this->putJson('/api/settings', ['tax_rate' => 5])->assertStatus(403)->assertJsonPath('confirm_password', true);
        $this->postJson('/api/auth/confirm-password', ['password' => 'wrong'])->assertStatus(422);
        $this->postJson('/api/auth/confirm-password', ['password' => 'owner-pass-2026'])->assertOk();
        $this->putJson('/api/settings', ['tax_rate' => 150])->assertStatus(422);
        $this->putJson('/api/settings', ['shop_name' => 'Singtel Mobile', 'tax_rate' => 5])
            ->assertOk()->assertJsonPath('changed', ['tax_rate'])->assertJsonPath('settings.tax_rate', 5);
    }

    public function test_document_numbers_are_sequential_and_unique(): void
    {
        $nos = array_map(fn () => DocNumber::next('invoice', 'INV-'), range(1, 5));
        $this->assertSame(['INV-1001', 'INV-1002', 'INV-1003', 'INV-1004', 'INV-1005'], $nos);
        $this->assertSame('RJ-1001', DocNumber::next('repair', 'RJ-'));
    }

    public function test_imei_is_globally_unique_at_database_level(): void
    {
        $catId = \DB::table('categories')->value('id');
        $p = \DB::table('products')->insertGetId(['code' => 'P-1', 'name' => 'Phone', 'category_id' => $catId, 'tracking' => 'imei']); // categories seeded with kinds
        $d1 = \DB::table('devices')->insertGetId(['product_id' => $p, 'imei1' => '356789012345678']);
        $d2 = \DB::table('devices')->insertGetId(['product_id' => $p, 'imei1' => '356789012345686']);
        \DB::table('device_identifiers')->insert(['device_id' => $d1, 'code' => '356789012345678', 'type' => 'imei1']);

        $this->expectException(\Illuminate\Database\UniqueConstraintViolationException::class);
        // same number used as IMEI 2 on another phone is still rejected
        \DB::table('device_identifiers')->insert(['device_id' => $d2, 'code' => '356789012345678', 'type' => 'imei2']);
    }
}
