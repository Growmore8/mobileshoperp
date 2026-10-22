<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->string('name', 80)->unique();
            $table->string('kind', 20)->unique(); // stable key the UI relies on: phone, watch, charge, audio, power, case, parts
            $table->unsignedSmallInteger('warranty_months')->default(0);
            $table->string('color', 9)->default('#475569');
            $table->timestamps();
        });

        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();
            $table->string('name');
            $table->string('contact')->nullable();
            $table->string('phone', 40)->nullable();
            $table->string('email')->nullable();
            $table->string('address')->nullable();
            $table->string('terms', 80)->nullable();
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();
            $table->string('name');
            $table->string('phone', 40);
            $table->string('phone_digits', 20)->unique(); // normalised, prevents duplicate customers
            $table->string('email')->nullable();
            $table->string('address')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index('name');
        });

        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();
            $table->string('name');
            $table->foreignId('category_id')->constrained()->restrictOnDelete();
            $table->string('brand', 80)->nullable()->index();
            $table->string('model', 80)->nullable();
            $table->string('variant', 80)->nullable();
            $table->string('color', 60)->nullable();
            $table->string('storage', 20)->nullable();
            $table->string('ram', 20)->nullable();
            $table->decimal('cost', 12, 2)->default(0);       // weighted average for qty items
            $table->decimal('price', 12, 2)->default(0);
            $table->decimal('wholesale', 12, 2)->default(0);
            $table->string('sku', 60)->nullable()->unique();
            $table->string('barcode', 60)->nullable()->unique();
            $table->enum('tracking', ['qty', 'imei', 'serial'])->default('qty');
            $table->enum('condition', ['new', 'used', 'refurbished'])->default('new');
            $table->unsignedInteger('min_stock')->default(0);
            $table->integer('qty')->default(0);                // only for tracking = qty
            $table->unsignedSmallInteger('warranty_months')->default(0);
            $table->string('warranty_provider', 20)->default('Manufacturer');
            $table->unsignedSmallInteger('used_warranty_months')->default(3);
            $table->unsignedSmallInteger('repair_warranty_days')->nullable(); // for spare parts
            $table->boolean('taxable')->default(true);
            $table->boolean('discountable')->default(true);
            $table->boolean('active')->default(true);
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->text('description')->nullable();
            $table->string('image')->nullable();
            $table->timestamps();
        });

        // One row per physical serialized unit (phone, watch…)
        Schema::create('devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->string('imei1', 20)->nullable();
            $table->string('imei2', 20)->nullable();
            $table->string('serial', 60)->nullable();
            $table->enum('condition', ['new', 'used', 'refurbished', 'damaged', 'under_repair'])->default('new');
            $table->enum('status', ['in_stock', 'sold', 'returned', 'damaged', 'missing', 'repair', 'supplier_return', 'warranty_return'])->default('in_stock')->index();
            $table->decimal('cost', 12, 2)->default(0);
            $table->string('location', 60)->default('Main Store');
            $table->foreignId('supplier_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedBigInteger('purchase_id')->nullable()->index();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedBigInteger('sale_id')->nullable()->index();
            $table->timestamp('sold_at')->nullable();
            $table->unsignedBigInteger('warranty_id')->nullable()->index();
            $table->unsignedBigInteger('replacement_id')->nullable()->index();
            $table->unsignedBigInteger('replaced_by_device_id')->nullable()->index();   // defective unit -> its replacement
            $table->unsignedBigInteger('replacement_of_device_id')->nullable()->index(); // replacement -> defective unit
            $table->timestamps();
        });

        // Every IMEI / serial of every unit, globally unique: the database itself rejects duplicates
        Schema::create('device_identifiers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->cascadeOnDelete();
            $table->string('code', 60)->unique();
            $table->enum('type', ['imei1', 'imei2', 'serial']);
        });

        // Full life history of a unit: purchased, sold, returned, repaired, replaced…
        Schema::create('device_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('device_id')->constrained()->cascadeOnDelete();
            $table->string('type', 80);
            $table->string('ref', 40)->nullable();
            $table->text('note')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('device_events');
        Schema::dropIfExists('device_identifiers');
        Schema::dropIfExists('devices');
        Schema::dropIfExists('products');
        Schema::dropIfExists('customers');
        Schema::dropIfExists('suppliers');
        Schema::dropIfExists('categories');
    }
};
