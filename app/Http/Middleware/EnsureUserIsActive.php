<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** A deactivated user's existing tokens stop working immediately. */
class EnsureUserIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user && ! $user->active) {
            $user->tokens()->delete();

            return response()->json(['message' => 'Your account has been deactivated. Please contact your administrator.'], 401);
        }

        return $next($request);
    }
}
