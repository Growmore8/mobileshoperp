<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Support\Permissions;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $roles = [
            'Administrator' => ['Full access to every module, setting and financial report.', true, []],
            'Store Manager' => ['Runs daily operations: sales, stock, repairs, warranties and reports. Cannot change roles or system settings.', false, [
                'dashboard' => ['view'], 'pos' => ['view', 'create', 'edit', 'print'], 'sales' => ['view', 'create', 'edit', 'approve', 'print', 'export', 'refund', 'cancel', 'manage'],
                'products' => ['view', 'create', 'edit', 'export'], 'inventory' => ['view', 'create', 'edit', 'approve', 'print', 'export', 'manage'], 'purchases' => ['view', 'create', 'edit', 'approve', 'print', 'export', 'cancel'],
                'customers' => ['view', 'create', 'edit', 'print', 'export'], 'suppliers' => ['view', 'create', 'edit', 'export'], 'repairs' => ['view', 'create', 'edit', 'approve', 'print', 'export', 'cancel', 'deliver', 'manage'],
                'warranties' => ['view', 'create', 'edit', 'approve', 'print', 'export', 'manage'], 'expenses' => ['view', 'create', 'edit', 'export'], 'reports' => ['view', 'print', 'export', 'manage'], 'users' => ['view'], 'settings' => ['view'],
            ]],
            'Sales Executive' => ['Counter sales, customer registration, repair intake and warranty look-ups. No refunds, costs or profit data.', false, [
                'dashboard' => ['view'], 'pos' => ['view', 'create', 'print'], 'sales' => ['view', 'create', 'print'], 'products' => ['view'], 'inventory' => ['view'],
                'customers' => ['view', 'create', 'edit', 'print'], 'repairs' => ['view', 'create', 'print', 'deliver'], 'warranties' => ['view', 'create', 'print'],
            ]],
            'Technician' => ['Works on assigned repair jobs: diagnosis, parts, status updates. No sales or financial access.', false, [
                'dashboard' => ['view'], 'repairs' => ['view', 'edit', 'print', 'deliver'], 'inventory' => ['view'], 'products' => ['view'], 'customers' => ['view'], 'warranties' => ['view'],
            ]],
            'Store Keeper' => ['Receives stock, registers IMEIs, manages products and requests stock adjustments.', false, [
                'dashboard' => ['view'], 'products' => ['view', 'create', 'edit', 'export'], 'inventory' => ['view', 'create', 'print', 'export'], 'purchases' => ['view', 'create', 'print'], 'suppliers' => ['view', 'create', 'edit'],
            ]],
        ];
        foreach ($roles as $name => [$desc, $admin, $perms]) {
            Role::firstOrCreate(['name' => $name], ['description' => $desc, 'is_admin' => $admin, 'permissions' => Permissions::sanitize($perms)]);
        }
    }
}
