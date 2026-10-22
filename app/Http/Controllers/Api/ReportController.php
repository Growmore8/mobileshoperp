<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Audit;
use App\Services\ReportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ReportController extends Controller
{
    public function __invoke(Request $request, string $type): JsonResponse
    {
        abort_unless(in_array($type, ['sales', 'inventory', 'repairs', 'warranty', 'financial'], true), 404, 'Unknown report.');
        $d = $request->validate(['from' => 'required|date', 'to' => 'required|date|after_or_equal:from']);
        $from = Carbon::parse($d['from']);
        $to = Carbon::parse($d['to']);
        abort_if($from->diffInDays($to) > 1100, 422, 'Please choose a period of 3 years or less.');

        $report = (new ReportService($from, $to))->$type();
        if ($request->boolean('export')) {
            Audit::log('reports', 'Report exported', ucfirst($type)." report {$from->toDateString()} – {$to->toDateString()}");
        }

        return response()->json(['type' => $type, 'from' => $from->toDateString(), 'to' => $to->toDateString()] + $report);
    }
}
