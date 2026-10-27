<?php

use App\Http\Controllers\FileController;
use Illuminate\Support\Facades\Route;

/*
| The shop UI is a single page (public/app.html) that talks to /api.
| Navigation inside the app uses #/hash routes, so only "/" needs serving.
*/
// Each script/stylesheet URL gets ?v=<file time>: the web server tells browsers to keep
// assets for years, so a changed file needs a new URL for staff to receive the update.
Route::get('/', function () {
    $html = preg_replace_callback('#(assets/[\w/.-]+\.(?:js|css))"#', function ($m) {
        $file = public_path($m[1]);

        return $m[1].'?v='.(is_file($file) ? filemtime($file) : 0).'"';
    }, file_get_contents(public_path('app.html')));

    return response($html, 200, [
        'Content-Type' => 'text/html; charset=UTF-8',
        'Cache-Control' => 'no-cache', // always load the latest UI after an update
    ]);
});

// Private photos & signatures — temporary signed links only (issued by /api/sync)
Route::middleware('signed')->group(function () {
    Route::get('files/{attachment}', [FileController::class, 'show'])->name('files.show');
    Route::get('files/signature/{repair}', [FileController::class, 'signature'])->name('files.signature');
});
