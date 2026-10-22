<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        Model::preventSilentlyDiscardingAttributes(! $this->app->isProduction());

        // Short, stable type names in polymorphic columns (payments, attachments)
        Relation::enforceMorphMap([
            'sale' => \App\Models\Sale::class,
            'repair' => \App\Models\Repair::class,
            'purchase' => \App\Models\Purchase::class,
            'claim' => \App\Models\Claim::class,
            'user' => \App\Models\User::class, // Sanctum token owner
        ]);

        // Brute-force protection: 5 attempts per minute per username + IP
        RateLimiter::for('login', function (Request $request) {
            return Limit::perMinute(5)->by(strtolower((string) $request->input('username')).'|'.$request->ip())
                ->response(fn () => response()->json(['message' => 'Too many sign-in attempts. Please wait a minute and try again.'], 429));
        });

        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(300)->by($request->user()?->id ?: $request->ip()));
    }
}
