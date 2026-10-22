<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'cost' => 'float',
            'price' => 'float',
            'wholesale' => 'float',
            'taxable' => 'boolean',
            'discountable' => 'boolean',
            'active' => 'boolean',
            'qty' => 'integer',
            'min_stock' => 'integer',
            'warranty_months' => 'integer',
            'used_warranty_months' => 'integer',
            'repair_warranty_days' => 'integer',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function devices(): HasMany
    {
        return $this->hasMany(Device::class);
    }
}
