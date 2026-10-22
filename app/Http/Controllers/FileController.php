<?php

namespace App\Http\Controllers;

use App\Models\Attachment;
use App\Models\Repair;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Private files (repair/claim photos, delivery signatures) are only reachable through
 * temporary signed links handed out by /api/sync to users allowed to see the record.
 */
class FileController extends Controller
{
    public function show(Attachment $attachment): StreamedResponse
    {
        abort_unless(Storage::disk('local')->exists($attachment->path), 404);

        return Storage::disk('local')->response($attachment->path, $attachment->original_name, ['Cache-Control' => 'private, max-age=3600']);
    }

    public function signature(Repair $repair): StreamedResponse
    {
        abort_unless($repair->signature_path && Storage::disk('local')->exists($repair->signature_path), 404);

        return Storage::disk('local')->response($repair->signature_path, null, ['Cache-Control' => 'private, max-age=3600']);
    }
}
