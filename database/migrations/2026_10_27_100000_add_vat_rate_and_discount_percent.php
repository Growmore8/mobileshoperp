<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
| Each sale / quotation keeps the VAT rate it was billed at (VAT can be switched off or the
| rate changed later without altering old invoices) and the discount % offered, if any.
*/
return new class extends Migration
{
    public function up(): void
    {
        foreach (['sales', 'quotations'] as $t) {
            Schema::table($t, function (Blueprint $table) {
                $table->decimal('discount_percent', 5, 2)->nullable()->after('discount');
                $table->decimal('tax_rate', 5, 2)->nullable()->after('tax');
            });
        }
    }

    public function down(): void
    {
        foreach (['sales', 'quotations'] as $t) {
            Schema::table($t, fn (Blueprint $table) => $table->dropColumn(['discount_percent', 'tax_rate']));
        }
    }
};
