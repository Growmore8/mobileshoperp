<?php

namespace App\Http\Middleware;

use App\Services\Audit;
use App\Support\Permissions;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Server-side permission check. Usage on a route: ->middleware('perm:sales,refund')
 * Several alternatives may be given with "|": perm:pos,view|sales,view
 */
class RequirePermission
{
    public function handle(Request $request, Closure $next, string ...$args): Response
    {
        $user = $request->user();
        $spec = implode(',', $args);
        foreach (explode('|', $spec) as $alt) {
            [$module, $action] = array_pad(explode(',', $alt), 2, 'view');
            if ($user && $user->hasPermission(trim($module), trim($action))) {
                return $next($request);
            }
        }
        [$module, $action] = array_pad(explode(',', explode('|', $spec)[0]), 2, 'view');
        Audit::log('users', 'Access denied', ($user?->name ?? 'Guest')." — {$action} on ".Permissions::label($module).' ('.$request->method().' '.$request->path().')');

        return response()->json([
            'message' => 'Access denied — your role does not have “'.ucfirst($action).'” permission for '.Permissions::label($module).'.',
        ], 403);
    }
}
