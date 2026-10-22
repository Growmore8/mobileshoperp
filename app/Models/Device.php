<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Device extends Model
{
    protected $guarded = ['id'];

    protected $appends = ['code'];

    public function getCodeAttribute(): string
    {
        return $this->imei1 ?: ($this->serial ?: '');
    }

    protected function casts(): array
    {
        return [
            'cost' => 'float',
            'sold_at' => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function purchase(): BelongsTo
    {
        return $this->belongsTo(Purchase::class);
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function warranty(): BelongsTo
    {
        return $this->belongsTo(Warranty::class);
    }

    public function identifiers(): HasMany
    {
        return $this->hasMany(DeviceIdentifier::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(DeviceEvent::class)->orderBy('id');
    }
}
