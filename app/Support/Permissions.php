<?php

namespace App\Support;

/**
 * Permission matrix definition — mirrors the UI (assets/js/core.js MODULES).
 * A role stores { module: [actions] }. Administrators bypass all checks.
 */
final class Permissions
{
    public const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'print', 'export', 'refund', 'cancel', 'deliver', 'manage'];

    public const MODULES = [
        'dashboard' => ['label' => 'Dashboard', 'actions' => ['view']],
        'pos' => ['label' => 'Billing / POS', 'actions' => ['view', 'create', 'edit', 'print']],
        'sales' => ['label' => 'Sales & Invoices', 'actions' => ['view', 'create', 'edit', 'delete', 'approve', 'print', 'export', 'refund', 'cancel', 'manage']],
        'products' => ['label' => 'Products', 'actions' => ['view', 'create', 'edit', 'delete', 'export']],
        'inventory' => ['label' => 'Inventory', 'actions' => ['view', 'create', 'edit', 'delete', 'approve', 'print', 'export', 'manage']],
        'purchases' => ['label' => 'Purchases', 'actions' => ['view', 'create', 'edit', 'delete', 'approve', 'print', 'export', 'cancel']],
        'customers' => ['label' => 'Customers', 'actions' => ['view', 'create', 'edit', 'delete', 'print', 'export']],
        'suppliers' => ['label' => 'Suppliers', 'actions' => ['view', 'create', 'edit', 'delete', 'export']],
        'repairs' => ['label' => 'Repairs', 'actions' => ['view', 'create', 'edit', 'delete', 'approve', 'print', 'export', 'cancel', 'deliver', 'manage']],
        'warranties' => ['label' => 'Warranties & Claims', 'actions' => ['view', 'create', 'edit', 'approve', 'print', 'export', 'manage']],
        'expenses' => ['label' => 'Expenses & Payments', 'actions' => ['view', 'create', 'edit', 'delete', 'approve', 'export']],
        'reports' => ['label' => 'Reports', 'actions' => ['view', 'print', 'export', 'manage']],
        'users' => ['label' => 'Users, Roles & Logs', 'actions' => ['view', 'create', 'edit', 'delete', 'manage']],
        'settings' => ['label' => 'Settings', 'actions' => ['view', 'manage']],
    ];

    /** Remove unknown modules/actions so a role can never store junk permissions. */
    public static function sanitize(array $perms): array
    {
        $clean = [];
        foreach (self::MODULES as $module => $def) {
            $actions = array_values(array_intersect($def['actions'], (array) ($perms[$module] ?? [])));
            // any action implies view
            if ($actions && ! in_array('view', $actions, true) && in_array('view', $def['actions'], true)) {
                array_unshift($actions, 'view');
            }
            if ($actions) {
                $clean[$module] = $actions;
            }
        }

        return $clean;
    }

    public static function label(string $module): string
    {
        return self::MODULES[$module]['label'] ?? $module;
    }
}
