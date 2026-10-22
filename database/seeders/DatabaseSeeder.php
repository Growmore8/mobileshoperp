<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Production-safe base data: settings, roles, categories and ONE administrator.
 * Run once on a new installation:  php artisan db:seed
 * Demo data (sample staff, products, sales…) lives in DemoSeeder and is never run in production.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([SettingSeeder::class, RoleSeeder::class]);

        foreach ([
            ['phone', 'Mobile Phones', 12, '#29abe2'], ['watch', 'Smartwatches & Wearables', 12, '#7c3aed'], ['charge', 'Chargers & Cables', 6, '#0891b2'],
            ['audio', 'Audio', 6, '#db2777'], ['power', 'Power Banks', 6, '#d97706'], ['case', 'Cases & Protection', 0, '#39b54a'], ['parts', 'Spare Parts', 0, '#475569'],
        ] as [$kind, $name, $months, $color]) {
            DB::table('categories')->updateOrInsert(['kind' => $kind], ['name' => $name, 'warranty_months' => $months, 'color' => $color, 'created_at' => now(), 'updated_at' => now()]);
        }

        if (! User::where('username', 'admin')->exists()) {
            $password = env('ADMIN_PASSWORD') ?: Str::password(14, symbols: false);
            User::create([
                'name' => 'Administrator',
                'username' => 'admin',
                'password' => $password,
                'role_id' => Role::where('is_admin', true)->value('id'),
                'active' => true,
            ]);
            $this->command?->warn("Administrator account created — username: admin  password: {$password}");
            $this->command?->warn('Sign in and change this password immediately (Account → Change password).');
        }
    }
}
