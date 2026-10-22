<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PurchaseReturn extends Model
{
    protected $guarded = ['id'];

    /** Changing this record marks its parent as updated (incremental sync). */
    protected $touches = ['purchase'];

    protected function casts(): array
    {
        return [
            'amount' => 'float',
            'items' => 'array',
        ];
    }

    public function purchase(): BelongsTo
    {
        return $this->belongsTo(Purchase::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
