<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WarrantyEvent extends Model
{
    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    /** Changing this record marks its parent as updated (incremental sync). */
    protected $touches = ['warranty'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function warranty(): BelongsTo
    {
        return $this->belongsTo(Warranty::class);
    }
}
