<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\DevDelete;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Developer tools. Only usernames listed in SHOP_DEVELOPERS may use them. */
class DevController extends Controller
{
    public function destroy(Request $request, string $type, int $id): JsonResponse
    {
        abort_unless(DevDelete::isDeveloper($request->user()), 403, 'Only the developer account can permanently delete records.');
        abort_unless(in_array($type, DevDelete::TYPES, true), 404);

        return response()->json(['deleted' => DevDelete::delete($type, $id)]);
    }
}
