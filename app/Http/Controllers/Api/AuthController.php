<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Models\User;
use App\Services\Audit;
use App\Support\PasswordConfirm;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username' => ['required', 'string', 'max:60'],
            'password' => ['required', 'string', 'max:200'],
            'remember' => ['sometimes', 'boolean'],
        ]);

        $user = User::with('role')->where('username', strtolower(trim($data['username'])))->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            if ($user) {
                $user->increment('failed_logins');
                Audit::log('users', 'Sign-in failed', "Wrong password for {$user->username}", null, $user->id);
            }

            return response()->json(['message' => 'Incorrect username or password.'], 422);
        }

        if (! $user->active) {
            Audit::log('users', 'Login blocked', "Deactivated account {$user->username} tried to sign in", null, $user->id);

            return response()->json(['message' => 'This account has been deactivated. Please contact your administrator.'], 403);
        }

        $user->forceFill(['failed_logins' => 0, 'last_login_at' => now()])->save();
        // "Keep me signed in on this device": the token lasts remember_days instead of a working day
        $remember = (bool) ($data['remember'] ?? false);
        $expires = $remember ? now()->addDays((int) config('sanctum.remember_days', 30)) : now()->addHours((int) config('sanctum.expiration_hours', 12));
        $token = $user->createToken($remember ? 'web-remember' : 'web', ['*'], $expires)->plainTextToken;
        Audit::log('users', 'Signed in', "{$user->name} signed in".($remember ? ' (kept signed in on this device)' : ''), null, $user->id);

        return response()->json(['token' => $token, 'user' => self::payload($user)]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => self::payload($request->user()->load('role'))]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();
        Audit::log('users', 'Signed out', $request->user()->name.' signed out');

        return response()->json(['message' => 'Signed out.']);
    }

    /** Re-enter your password before opening a protected screen (Settings). */
    public function confirmPassword(Request $request): JsonResponse
    {
        $data = $request->validate(['password' => ['required', 'string', 'max:200']]);
        if (! Hash::check($data['password'], $request->user()->password)) {
            Audit::log('users', 'Password confirmation failed', $request->user()->name.' entered a wrong password to open Settings');

            return response()->json(['message' => 'Incorrect password.', 'errors' => ['password' => ['Incorrect password.']]], 422);
        }
        PasswordConfirm::remember($request);

        return response()->json(['confirmed' => true, 'minutes' => PasswordConfirm::MINUTES]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'current_password'],
            'password' => ['required', 'confirmed', Password::min(8)],
        ]);
        $user = $request->user();
        $user->update(['password' => $data['password']]);
        // sign out all other devices
        $user->tokens()->where('id', '!=', $user->currentAccessToken()->id)->delete();
        Audit::log('users', 'Password changed', "{$user->name} changed their password");

        return response()->json(['message' => 'Password updated.']);
    }

    /** Public: what the login page needs before anyone signs in. */
    public function meta(): JsonResponse
    {
        $demo = (bool) config('shop.demo');
        $accounts = [];
        if ($demo) {
            $users = User::with('role:id,name')->whereIn('username', array_column(config('shop.demo_accounts'), 0))->get()->keyBy('username');
            foreach (config('shop.demo_accounts') as [$username, $password]) {
                if ($u = $users->get($username)) {
                    $accounts[] = ['username' => $username, 'password' => $password, 'name' => $u->name, 'role' => $u->role->name, 'active' => $u->active];
                }
            }
        }

        return response()->json(['demo' => $demo, 'shop_name' => Setting::get('shop_name', 'Shop'), 'demo_accounts' => $accounts]);
    }

    /** Demo installations only: wipe and regenerate realistic sample data for a client presentation. */
    public function resetDemo(Request $request): JsonResponse
    {
        abort_unless(config('shop.demo'), 403, 'Demo reset is disabled on this installation.');
        abort_unless($request->user()->isAdmin(), 403, 'Only an administrator can reset demo data.');
        \Illuminate\Support\Facades\Artisan::call('migrate:fresh', ['--force' => true, '--seed' => true, '--seeder' => 'Database\\Seeders\\DemoSeeder']);

        return response()->json(['message' => 'Demo data has been reset. Please sign in again.']);
    }

    /** What the UI needs about the signed-in user (no secrets). */
    public static function payload(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => [
                'id' => $user->role->id,
                'name' => $user->role->name,
                'is_admin' => $user->role->is_admin,
                'permissions' => $user->role->is_admin ? null : ($user->role->permissions ?? []),
            ],
            'settings' => collect(Setting::map())->only(SettingsController::PUBLIC_KEYS)->all(),
        ];
    }
}
