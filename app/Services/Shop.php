<?php

namespace App\Services;

use App\Exceptions\BusinessRuleException;
use App\Models\Setting;
use App\Models\User;
use App\Support\Permissions;
use Illuminate\Support\Facades\Auth;

/** Small shared helpers for the service layer. */
final class Shop
{
    public static function user(): ?User
    {
        return Auth::user();
    }

    /** Secondary permission checks inside a service (route middleware handles the primary one). */
    public static function need(string $module, string $action): void
    {
        $u = self::user();
        if (! $u || ! $u->hasPermission($module, $action)) {
            throw new BusinessRuleException('Access denied — your role does not have “'.ucfirst($action).'” permission for '.Permissions::label($module).'.', 403);
        }
    }

    public static function can(string $module, string $action): bool
    {
        return (bool) self::user()?->hasPermission($module, $action);
    }

    public static function money(float|int|string|null $v): float
    {
        return round((float) $v, 2);
    }

    public static function fmt(float|int|string|null $v): string
    {
        $v = self::money($v);
        $s = number_format(abs($v), fmod($v, 1) ? 2 : 0);

        return ($v < 0 ? '−' : '').Setting::get('currency', 'Rs.').' '.$s;
    }

    public static function setting(string $key, mixed $default = null): mixed
    {
        return Setting::get($key, $default);
    }

    public static function fail(string $message, int $status = 422): never
    {
        throw new BusinessRuleException($message, $status);
    }
}
