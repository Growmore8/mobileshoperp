<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $f = $request->validate([
            'module' => ['nullable', 'string', 'max:40'],
            'user_id' => ['nullable', 'integer'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'q' => ['nullable', 'string', 'max:100'],
            'ref' => ['nullable', 'string', 'max:40'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:200'],
        ]);

        $logs = ActivityLog::with('user:id,name')
            ->when($f['module'] ?? null, fn ($q, $v) => $q->where('module', $v))
            ->when($f['user_id'] ?? null, fn ($q, $v) => $q->where('user_id', $v))
            ->when($f['ref'] ?? null, fn ($q, $v) => $q->where('ref', $v))
            ->when($f['from'] ?? null, fn ($q, $v) => $q->where('created_at', '>=', $v))
            ->when($f['to'] ?? null, fn ($q, $v) => $q->where('created_at', '<', date('Y-m-d', strtotime($v.' +1 day'))))
            ->when($f['q'] ?? null, fn ($q, $v) => $q->where(fn ($w) => $w->where('action', 'like', "%$v%")->orWhere('detail', 'like', "%$v%")->orWhere('ref', 'like', "%$v%")))
            ->orderByDesc('id')
            ->paginate($f['per_page'] ?? 50);

        return response()->json($logs);
    }
}
