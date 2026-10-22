<?php

use App\Http\Controllers\FileController;
use Illuminate\Support\Facades\Route;

/*
| The shop UI is a single page (public/app.html) that talks to /api.
| Navigation inside the app uses #/hash routes, so only "/" needs serving.
*/
Route::get('/', fn () => response()->file(public_path('app.html'), [
    'Content-Type' => 'text/html; charset=UTF-8',
    'Cache-Control' => 'no-cache', // always load the latest UI after an update
]));

// Private photos & signatures — temporary signed links only (issued by /api/sync)
Route::middleware('signed')->group(function () {
    Route::get('files/{attachment}', [FileController::class, 'show'])->name('files.show');
    Route::get('files/signature/{repair}', [FileController::class, 'signature'])->name('files.signature');
});
