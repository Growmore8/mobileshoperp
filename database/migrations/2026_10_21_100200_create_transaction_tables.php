<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        /* ---------- Purchases ---------- */
        Schema::create('purchases', function (Blueprint $table) {
            $table->id();
            $table->string('no', 20)->unique();
            $table->foreignId('supplier_id')->constrained()->restrictOnDelete();
            $table->string('supplier_invoice', 60)->nullable();
            $table->date('date');
            $table->date('expected_date')->nullable();
            $table->enum('status', ['ordered', 'received', 'cancelled'])->index();
            $table->decimal('total', 12, 2)->default(0);
            $table->text('note')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('received_at')->nullable();
            $table->string('cancel_reason')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();
        });
        Schema::create('purchase_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('qty');
            $table->decimal('cost', 12, 2);
            $table->string('condition', 20)->default('new');
        });
        Schema::create('purchase_returns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('purchase_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 12, 2);
            $table->string('reason');
            $table->json('items');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });

        /* ---------- Sales ---------- */
        Schema::create('sales', function (Blueprint $table) {
            $table->id();
            $table->string('no', 20)->unique();
            $table->date('date')->index();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('subtotal', 12, 2);
            $table->decimal('discount', 12, 2)->default(0);
            $table->decimal('tax', 12, 2)->default(0);
            $table->decimal('total', 12, 2);
            $table->boolean('tax_inclusive')->default(true);
            $table->decimal('change_given', 12, 2)->default(0);
            $table->text('note')->nullable();
            $table->enum('status', ['completed', 'partially_refunded', 'refunded', 'cancelled'])->default('completed')->index();
            $table->string('cancel_reason')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();
        });
        Schema::create('sale_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('device_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('code', 60)->nullable(); // IMEI / serial at time of sale
            $table->unsignedInteger('qty');
            $table->decimal('price', 12, 2);
            $table->decimal('discount', 12, 2)->default(0);
            $table->decimal('line_total', 12, 2);
            $table->decimal('tax', 12, 2)->default(0);
            $table->decimal('cost', 12, 2)->default(0);
            $table->unsignedInteger('returned_qty')->default(0);
            $table->unsignedBigInteger('warranty_id')->nullable()->index();
        });
        Schema::create('sale_returns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 12, 2);
            $table->decimal('refund', 12, 2)->default(0);
            $table->string('method', 30)->nullable();
            $table->string('restock', 20);
            $table->string('reason');
            $table->json('items');
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });
        Schema::create('quotations', function (Blueprint $table) {
            $table->id();
            $table->string('no', 20)->unique();
            $table->date('date');
            $table->date('valid_until');
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('subtotal', 12, 2);
            $table->decimal('discount', 12, 2)->default(0);
            $table->decimal('tax', 12, 2)->default(0);
            $table->decimal('total', 12, 2);
            $table->text('note')->nullable();
            $table->timestamps();
        });
        Schema::create('quotation_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('quotation_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->string('name');
            $table->unsignedInteger('qty');
            $table->decimal('price', 12, 2);
            $table->decimal('discount', 12, 2)->default(0);
            $table->decimal('line_total', 12, 2);
        });

        /* ---------- Repairs ---------- */
        Schema::create('repairs', function (Blueprint $table) {
            $table->id();
            $table->string('no', 20)->unique();
            $table->foreignId('customer_id')->constrained()->restrictOnDelete();
            $table->foreignId('device_id')->nullable()->constrained()->nullOnDelete(); // when the phone was sold by us
            $table->unsignedBigInteger('sale_id')->nullable();
            $table->string('brand', 60);
            $table->string('model', 80);
            $table->string('color', 40)->nullable();
            $table->string('imei', 20)->nullable()->index();
            $table->string('serial', 60)->nullable()->index();
            $table->text('condition')->nullable();
            $table->json('accessories')->nullable();
            $table->text('problem');
            $table->string('existing_damage')->nullable();
            $table->string('type', 60);
            $table->string('priority', 10)->default('Normal');
            $table->decimal('estimate', 12, 2)->default(0);
            $table->date('expected_date')->nullable();
            $table->foreignId('technician_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('diagnosis')->nullable();
            $table->text('notes')->nullable();
            $table->decimal('labor', 12, 2)->default(0);
            $table->boolean('labor_covered')->default(false);
            $table->decimal('tech_cost', 12, 2)->default(0);
            $table->decimal('discount', 12, 2)->default(0);
            $table->enum('approval_status', ['pending', 'approved', 'rejected'])->default('pending');
            $table->decimal('approval_amount', 12, 2)->default(0);
            $table->timestamp('approval_at')->nullable();
            $table->string('approval_by')->nullable();
            $table->boolean('terms_accepted')->default(false);
            $table->enum('status', ['received', 'inspection', 'diagnosed', 'awaiting_approval', 'awaiting_parts', 'in_progress', 'completed', 'qc', 'ready', 'delivered', 'cancelled'])->default('received')->index();
            $table->timestamp('received_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('ready_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->foreignId('delivered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('collected_by')->nullable();
            $table->string('signature_path')->nullable();
            $table->boolean('is_warranty_repair')->default(false);
            $table->unsignedBigInteger('claim_id')->nullable()->index();
            $table->unsignedBigInteger('parent_repair_id')->nullable()->index();
            $table->unsignedBigInteger('warranty_id')->nullable()->index();
            $table->string('cancel_reason')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
        Schema::create('repair_parts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('repair_id')->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->string('name');
            $table->unsignedInteger('qty');
            $table->decimal('price', 12, 2);
            $table->decimal('cost', 12, 2);
            $table->boolean('covered')->default(false);
            $table->unsignedSmallInteger('warranty_days')->default(90);
            $table->timestamps();
        });
        Schema::create('repair_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('repair_id')->constrained()->cascadeOnDelete();
            $table->string('status', 30);
            $table->text('note')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();
        });

        /* ---------- Money ledger (sales, repairs, purchases) ---------- */
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->morphs('payable');                 // Sale | Repair | Purchase
            $table->string('kind', 30);                // receipt | refund | advance | supplier_payment
            $table->string('method', 30);
            $table->decimal('amount', 12, 2);          // negative for refunds
            $table->string('reference', 80)->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('created_at')->useCurrent()->index();
        });

        /* ---------- Stock ---------- */
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('device_id')->nullable()->constrained()->nullOnDelete();
            $table->integer('qty');                    // + in, − out, 0 = traced but not sellable
            $table->string('type', 80)->index();
            $table->string('ref', 40)->nullable()->index();
            $table->string('note')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('created_at')->useCurrent()->index();
        });
        Schema::create('stock_adjustments', function (Blueprint $table) {
            $table->id();
            $table->string('no', 20)->unique();
            $table->foreignId('product_id')->constrained()->restrictOnDelete();
            $table->foreignId('device_id')->nullable()->constrained()->nullOnDelete();
            $table->integer('qty')->default(0);
            $table->string('type', 40); 
            $table->string('reason');
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending')->index();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->string('reject_note')->nullable();
            $table->timestamps();
        });

        /* ---------- Expenses ---------- */
        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->string('no', 20)->unique();
            $table->date('date')->index();
            $table->string('category', 60);
            $table->decimal('amount', 12, 2);
            $table->string('method', 30);
            $table->string('note')->nullable();
            $table->enum('status', ['posted', 'void'])->default('posted');
            $table->string('void_reason')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        foreach (['expenses', 'stock_adjustments', 'stock_movements', 'payments', 'repair_events', 'repair_parts', 'repairs', 'quotation_items', 'quotations', 'sale_returns', 'sale_items', 'sales', 'purchase_returns', 'purchase_items', 'purchases'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
