<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Product models (variants): one product such as "Back covers" P-1001 holds several models
 * (iPhone 11, iPhone 12…). Each model is its own product row with parent_id set, so it keeps
 * its own price, cost, barcode and stock. The parent is a group (has_models) and holds no stock.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->foreignId('parent_id')->nullable()->after('id')->constrained('products')->nullOnDelete();
            $table->boolean('has_models')->default(false)->after('parent_id');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropConstrainedForeignId('parent_id');
            $table->dropColumn('has_models');
        });
    }
};
