<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RepairEvent extends Model
{
    public const UPDATED_AT = null;

    protected $guarded = ['id'];

    /** Changing this record marks its parent as updated (incremental sync). */
    protected $touches = ['repair'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function repair(): BelongsTo
    {
        return $this->belongsTo(Repair::class);
    }
}
