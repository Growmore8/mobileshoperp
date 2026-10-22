<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Key/value business settings (shop profile, tax, warranty policy, repair types…)
        Schema::create('settings', function (Blueprint $table) {
            $table->string('key', 80)->primary();
            $table->json('value')->nullable();
            $table->timestamps();
        });

        // Gap-free document numbering (INV-, PUR-, RJ-, PW-…), incremented under a row lock
        Schema::create('counters', function (Blueprint $table) {
            $table->string('key', 40)->primary();
            $table->unsignedBigInteger('value')->default(1000);
        });

        // Audit trail — never updated or deleted by the application
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('module', 40)->index();
            $table->string('action', 80);
            $table->text('detail')->nullable();
            $table->string('ref', 40)->nullable()->index();
            $table->string('ip', 45)->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
        });

        // Photos, documents and signatures for repairs, claims, etc.
        Schema::create('attachments', function (Blueprint $table) {
            $table->id();
            $table->morphs('attachable');
            $table->string('kind', 20)->default('photo'); // photo | document | signature
            $table->string('path');
            $table->string('original_name')->nullable();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attachments');
        Schema::dropIfExists('activity_logs');
        Schema::dropIfExists('counters');
        Schema::dropIfExists('settings');
    }
};
