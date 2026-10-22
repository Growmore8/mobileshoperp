<?php

namespace App\Services;

use App\Models\ActivityLog;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;

/** Writes the audit trail. Called by every service that changes data. */
class Audit
{
    public static function log(string $module, string $action, string $detail = '', ?string $ref = null, ?int $userId = null): void
    {
        ActivityLog::create([
            'user_id' => $userId ?? Auth::id(),
            'module' => $module,
            'action' => $action,
            'detail' => mb_substr($detail, 0, 2000),
            'ref' => $ref,
            'ip' => Request::ip(),
        ]);
    }
}
