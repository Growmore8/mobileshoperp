<?php

namespace App\Support;

final class Imei
{
    /** Strip spaces/dashes and upper-case (serials are case-insensitive). */
    public static function normalize(?string $code): string
    {
        return strtoupper(preg_replace('/[\s-]+/', '', (string) $code));
    }

    public static function checkDigit(string $body14): int
    {
        $total = 0;
        for ($i = 0; $i < strlen($body14); $i++) {
            $d = (int) $body14[strlen($body14) - 1 - $i];
            if ($i % 2 === 0) {
                $d *= 2;
                if ($d > 9) {
                    $d -= 9;
                }
            }
            $total += $d;
        }

        return (10 - ($total % 10)) % 10;
    }

    /** 15 digits with a valid Luhn check digit. */
    public static function valid(?string $code): bool
    {
        $v = self::normalize($code);

        return (bool) preg_match('/^\d{15}$/', $v) && self::checkDigit(substr($v, 0, 14)) === (int) $v[14];
    }
}
