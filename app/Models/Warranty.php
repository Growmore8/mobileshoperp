<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Warranty extends Model
{
    protected $guarded = ['id'];

    /** Live status: active | expiring | expired | void | replaced */
    protected $appends = ['state'];

    public function getStateAttribute(): string
    {
        return \App\Services\WarrantyService::status($this);
    }

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'original_start' => 'date',
            'months' => 'integer',
            'qty' => 'integer',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function repair(): BelongsTo
    {
        return $this->belongsTo(Repair::class);
    }

    public function components(): HasMany
    {
        return $this->hasMany(WarrantyComponent::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(WarrantyEvent::class)->orderBy('id');
    }

    public function claims(): HasMany
    {
        return $this->hasMany(Claim::class);
    }
}
