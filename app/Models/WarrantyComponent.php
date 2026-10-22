<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WarrantyComponent extends Model
{
    public $timestamps = false;

    protected $guarded = ['id'];

    /** Changing this record marks its parent as updated (incremental sync). */
    protected $touches = ['warranty'];

    protected function casts(): array
    {
        return [
            'end_date' => 'date',
            'days' => 'integer',
        ];
    }

    public function warranty(): BelongsTo
    {
        return $this->belongsTo(Warranty::class);
    }
}
