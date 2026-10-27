<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * "Confirm your password" for sensitive screens (Settings). A confirmation is remembered
 * for this sign-in session only (per token) and expires after MINUTES.
 */
final class PasswordConfirm
{
    public const MINUTES = 15;

    private static function key(Request $request): string
    {
        $token = $request->user()->currentAccessToken();

        return 'pw-confirmed:'.$request->user()->id.':'.($token instanceof PersonalAccessToken ? $token->id : 'transient');
    }

    public static function remember(Request $request): void
    {
        Cache::put(self::key($request), true, now()->addMinutes(self::MINUTES));
    }

    public static function confirmed(Request $request): bool
    {
        return Cache::has(self::key($request));
    }
}
