<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Repair extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'accessories' => 'array',
            'estimate' => 'float',
            'labor' => 'float',
            'tech_cost' => 'float',
            'discount' => 'float',
            'approval_amount' => 'float',
            'labor_covered' => 'boolean',
            'terms_accepted' => 'boolean',
            'is_warranty_repair' => 'boolean',
            'expected_date' => 'date',
            'received_at' => 'datetime',
            'completed_at' => 'datetime',
            'ready_at' => 'datetime',
            'delivered_at' => 'datetime',
            'approval_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }

    public function technician(): BelongsTo
    {
        return $this->belongsTo(User::class, 'technician_id');
    }

    public function parts(): HasMany
    {
        return $this->hasMany(RepairPart::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(RepairEvent::class)->orderBy('id');
    }

    public function payments(): MorphMany
    {
        return $this->morphMany(Payment::class, 'payable');
    }

    public function attachments(): MorphMany
    {
        return $this->morphMany(Attachment::class, 'attachable');
    }

    public function warranty(): BelongsTo
    {
        return $this->belongsTo(Warranty::class);
    }

    public function claim(): BelongsTo
    {
        return $this->belongsTo(Claim::class);
    }

    public function deliverer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delivered_by');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Repair::class, 'parent_repair_id');
    }
}
