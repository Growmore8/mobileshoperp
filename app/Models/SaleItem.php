<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SaleItem extends Model
{
    public $timestamps = false;

    protected $guarded = ['id'];

    /** Changing this record marks its parent as updated (incremental sync). */
    protected $touches = ['sale'];

    protected function casts(): array
    {
        return [
            'price' => 'float',
            'discount' => 'float',
            'line_total' => 'float',
            'tax' => 'float',
            'cost' => 'float',
            'qty' => 'integer',
            'returned_qty' => 'integer',
        ];
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }

    public function warranty(): BelongsTo
    {
        return $this->belongsTo(Warranty::class);
    }
}
