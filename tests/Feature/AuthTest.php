<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    public function test_user_can_sign_in_and_receives_token_role_and_settings(): void
    {
        $u = User::factory()->role('Sales Executive')->create(['username' => 'kevin', 'password' => 'secret-pass']);

        $res = $this->postJson('/api/auth/login', ['username' => 'KEVIN ', 'password' => 'secret-pass'])->assertOk();

        $res->assertJsonPath('user.username', 'kevin')
            ->assertJsonPath('user.role.name', 'Sales Executive')
            ->assertJsonPath('user.settings.shop_name', 'Singtel Mobile');
        $this->assertNotEmpty($res->json('token'));
        $this->assertNotNull($u->fresh()->last_login_at);
        $this->assertDatabaseHas('activity_logs', ['action' => 'Signed in', 'user_id' => $u->id]);
    }

    public function test_keep_me_signed_in_issues_a_30_day_token(): void
    {
        User::factory()->role('Sales Executive')->create(['username' => 'kevin', 'password' => 'secret-pass']);

        $this->postJson('/api/auth/login', ['username' => 'kevin', 'password' => 'secret-pass'])->assertOk();
        $short = \Laravel\Sanctum\PersonalAccessToken::latest('id')->first();
        $this->assertTrue($short->expires_at->between(now()->addHours(11), now()->addHours(13)));

        $this->postJson('/api/auth/login', ['username' => 'kevin', 'password' => 'secret-pass', 'remember' => true])->assertOk();
        $long = \Laravel\Sanctum\PersonalAccessToken::latest('id')->first();
        $this->assertTrue($long->expires_at->between(now()->addDays(29), now()->addDays(31)));
        $this->assertTrue(ActivityLog::where('action', 'Signed in')->where('detail', 'like', '%(kept signed in on this device)')->exists());
    }

    public function test_wrong_password_is_rejected_and_counted(): void
    {
        $u = User::factory()->create(['username' => 'kevin', 'password' => 'secret-pass']);
        $this->postJson('/api/auth/login', ['username' => 'kevin', 'password' => 'nope'])
            ->assertStatus(422)->assertJsonPath('message', 'Incorrect username or password.');
        $this->assertSame(1, $u->fresh()->failed_logins);
    }

    public function test_deactivated_account_cannot_sign_in(): void
    {
        User::factory()->inactive()->create(['username' => 'tom', 'password' => 'secret-pass']);
        $this->postJson('/api/auth/login', ['username' => 'tom', 'password' => 'secret-pass'])
            ->assertStatus(403)->assertJsonPath('message', 'This account has been deactivated. Please contact your administrator.');
        $this->assertTrue(ActivityLog::where('action', 'Login blocked')->exists());
    }

    public function test_deactivating_a_user_kills_their_existing_token(): void
    {
        $u = User::factory()->create(['username' => 'kevin', 'password' => 'secret-pass']);
        $token = $this->postJson('/api/auth/login', ['username' => 'kevin', 'password' => 'secret-pass'])->json('token');

        $u->update(['active' => false]);

        $this->withToken($token)->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_login_is_rate_limited(): void
    {
        User::factory()->create(['username' => 'kevin', 'password' => 'secret-pass']);
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['username' => 'kevin', 'password' => 'bad']);
        }
        $this->postJson('/api/auth/login', ['username' => 'kevin', 'password' => 'secret-pass'])->assertStatus(429);
    }

    public function test_api_requires_token(): void
    {
        $this->getJson('/api/auth/me')->assertStatus(401)->assertJsonPath('message', 'Your session has expired. Please sign in again.');
    }

    public function test_logout_revokes_token(): void
    {
        User::factory()->create(['username' => 'kevin', 'password' => 'secret-pass']);
        $token = $this->postJson('/api/auth/login', ['username' => 'kevin', 'password' => 'secret-pass'])->json('token');
        $this->withToken($token)->postJson('/api/auth/logout')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->getJson('/api/auth/me')->assertStatus(401);
    }

    public function test_base_seeder_creates_single_admin_with_random_password(): void
    {
        $this->assertSame(1, User::count());
        $admin = User::first();
        $this->assertSame('admin', $admin->username);
        $this->assertTrue($admin->isAdmin());
        $this->postJson('/api/auth/login', ['username' => 'admin', 'password' => 'admin123'])->assertStatus(422);
    }
}
