<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
 * Fresh start before going live: removes every product, stock unit, purchase, sale, repair, warranty, customer,
 * supplier, expense and payment, and restarts document numbers. Users, roles, settings and categories stay.
 * Run on the server as the site user, after a backup:  php artisan shop:clear-test-data --confirm=DELETE
 */
Artisan::command('shop:clear-test-data {--confirm=}', function () {
    if ($this->option('confirm') !== 'DELETE') {
        $this->error('Nothing deleted. This removes ALL products, stock, sales, purchases, repairs, warranties, customers and suppliers.');
        $this->line('Take a backup first, then run:  php artisan shop:clear-test-data --confirm=DELETE');

        return 1;
    }
    $tables = ['replacements', 'claim_events', 'claims', 'warranty_events', 'warranty_components', 'warranties', 'repair_events', 'repair_parts', 'repairs',
        'quotation_items', 'quotations', 'sale_returns', 'sale_items', 'sales', 'purchase_returns', 'purchase_items', 'purchases', 'payments',
        'stock_adjustments', 'stock_movements', 'device_events', 'device_identifiers', 'devices', 'products', 'expenses', 'customers', 'suppliers',
        'attachments', 'counters', 'activity_logs'];
    \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();
    foreach ($tables as $t) {
        $n = \Illuminate\Support\Facades\DB::table($t)->count();
        \Illuminate\Support\Facades\DB::table($t)->truncate();
        $this->line(str_pad($t, 22)." $n row(s) removed");
    }
    \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    \App\Services\Audit::log('settings', 'Test data cleared', 'All products, stock, sales, purchases, repairs, warranties, customers and suppliers were removed before going live');
    $this->info('Done. Users, roles, settings and categories were kept. Ask everyone to sign out and sign in again.');

    return 0;
})->purpose('Delete all test data (keeps users, roles, settings and categories)');
