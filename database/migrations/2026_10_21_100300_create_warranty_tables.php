<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Product warranties and repair warranties are separate records (kind)
        Schema::create('warranties', function (Blueprint $table) {
            $table->id();
            $table->string('no', 20)->unique();
            $table->enum('kind', ['product', 'repair'])->index();
            $table->enum('status', ['active', 'void', 'replaced'])->default('active')->index();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('device_id')->nullable()->constrained()->nullOnDelete();
            $table->string('imei', 20)->nullable()->index();
            $table->string('serial', 60)->nullable()->index();
            $table->foreignId('sale_id')->nullable()->constrained()->nullOnDelete();
            $table->string('invoice_no', 20)->nullable()->index();
            $table->foreignId('repair_id')->nullable()->constrained()->nullOnDelete();
            $table->string('job_no', 20)->nullable()->index();
            $table->string('device_label')->nullable();
            $table->string('provider', 20)->nullable();   // Manufacturer | Distributor | Shop
            $table->string('type', 80)->nullable();
            $table->string('condition', 20)->nullable();
            $table->unsignedSmallInteger('months')->nullable();
            $table->unsignedInteger('qty')->default(1);
            $table->date('start_date');
            $table->date('end_date')->index();             // for repair warranties = latest component end
            $table->date('original_start')->nullable();
            $table->text('terms')->nullable();
            $table->string('void_reason')->nullable();
            // replacement chain
            $table->unsignedBigInteger('replaces_warranty_id')->nullable()->index();
            $table->unsignedBigInteger('replaced_by_warranty_id')->nullable()->index();
            $table->unsignedBigInteger('replacement_id')->nullable()->index();
            $table->string('replaced_device_code', 60)->nullable();
            $table->enum('mode', ['remaining', 'months', 'date'])->nullable(); // how the replacement period was chosen
            $table->timestamps();
        });

        // Repair warranty coverage: labour and each replaced part have their own period
        Schema::create('warranty_components', function (Blueprint $table) {
            $table->id();
            $table->foreignId('warranty_id')->constrained()->cascadeOnDelete();
            $table->enum('type', ['labor', 'part']);
            $table->string('label');
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedSmallInteger('days');
            $table->date('end_date');
        });

        Schema::create('warranty_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('warranty_id')->constrained()->cascadeOnDelete();
            $table->string('action', 60);
            $table->text('note')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('claims', function (Blueprint $table) {
            $table->id();
            $table->string('no', 20)->unique();
            $table->enum('kind', ['product', 'repair'])->index();
            $table->foreignId('warranty_id')->constrained()->restrictOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->date('date');
            $table->text('fault');
            $table->json('flags')->nullable();              // physical, liquid, tampered, unrelated
            $table->text('notes')->nullable();
            $table->boolean('eligible')->default(true);
            $table->json('eligibility_reasons')->nullable();
            $table->enum('status', ['pending', 'inspection', 'approved', 'rejected', 'resolved'])->default('pending')->index();
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->text('findings')->nullable();
            $table->string('decision_note')->nullable();
            $table->boolean('override')->default(false);
            $table->enum('resolution', ['repair', 'replacement', 'refund', 'other'])->nullable();
            $table->string('resolution_note')->nullable();
            $table->decimal('cost', 12, 2)->default(0);
            $table->foreignId('repair_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedBigInteger('replacement_id')->nullable()->index();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('claim_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('claim_id')->constrained()->cascadeOnDelete();
            $table->string('action', 60);
            $table->text('note')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();
        });

        // Warranty replacement: defective unit returned, new unit given — both permanently linked
        Schema::create('replacements', function (Blueprint $table) {
            $table->id();
            $table->string('no', 20)->unique();
            $table->foreignId('claim_id')->constrained()->restrictOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('sale_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('old_device_id')->constrained('devices')->restrictOnDelete();
            $table->foreignId('new_device_id')->constrained('devices')->restrictOnDelete();
            $table->string('old_code', 60);
            $table->string('new_code', 60);
            $table->foreignId('old_product_id')->constrained('products')->restrictOnDelete();
            $table->foreignId('new_product_id')->constrained('products')->restrictOnDelete();
            $table->foreignId('old_warranty_id')->constrained('warranties')->restrictOnDelete();
            $table->foreignId('new_warranty_id')->constrained('warranties')->restrictOnDelete();
            $table->enum('mode', ['remaining', 'months', 'date']);
            $table->decimal('cost', 12, 2)->default(0);
            $table->string('note')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['replacements', 'claim_events', 'claims', 'warranty_events', 'warranty_components', 'warranties'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
