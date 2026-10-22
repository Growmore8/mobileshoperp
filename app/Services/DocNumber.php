<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Sequential document numbers (INV-1001, RJ-1001…).
 * The counter row is locked for the duration of the surrounding transaction,
 * so two cashiers can never receive the same invoice number.
 */
class DocNumber
{
    public static function next(string $key, string $prefix): string
    {
        return DB::transaction(function () use ($key, $prefix) {
            $row = DB::table('counters')->where('key', $key)->lockForUpdate()->first();
            if (! $row) {
                DB::table('counters')->insert(['key' => $key, 'value' => 1001]);
                $value = 1001;
            } else {
                $value = $row->value + 1;
                DB::table('counters')->where('key', $key)->update(['value' => $value]);
            }

            return $prefix.$value;
        });
    }
}
