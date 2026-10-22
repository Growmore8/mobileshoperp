<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class Attachment extends Model
{
    protected $guarded = ['id'];

    /** Changing this record marks its parent as updated (incremental sync). */
    protected $touches = ['attachable'];

    public function attachable(): MorphTo
    {
        return $this->morphTo();
    }
}
