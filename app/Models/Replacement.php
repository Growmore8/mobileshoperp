<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Replacement extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'cost' => 'float',
        ];
    }

    public function claim(): BelongsTo
    {
        return $this->belongsTo(Claim::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function oldDevice(): BelongsTo
    {
        return $this->belongsTo(Device::class, 'old_device_id');
    }

    public function newDevice(): BelongsTo
    {
        return $this->belongsTo(Device::class, 'new_device_id');
    }

    public function oldWarranty(): BelongsTo
    {
        return $this->belongsTo(Warranty::class, 'old_warranty_id');
    }

    public function newWarranty(): BelongsTo
    {
        return $this->belongsTo(Warranty::class, 'new_warranty_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
