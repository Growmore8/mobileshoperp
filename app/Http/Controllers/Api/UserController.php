<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use App\Services\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class UserController extends Controller
{
    public function index(): JsonResponse
    {
        $users = User::with('role:id,name,is_admin')->orderBy('name')->get()
            ->map(fn (User $u) => $this->row($u));

        return response()->json(['data' => $users]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        if (empty($data['password'])) {
            throw new BusinessRuleException('A password is required for new accounts.');
        }
        $user = User::create($data + ['active' => true]);
        Audit::log('users', 'User created', "{$user->name} ({$user->username}) as ".$user->role->name);

        return response()->json(['data' => $this->row($user->load('role'))], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $data = $this->validated($request, $user);
        $me = $request->user();

        if ($user->is($me) && (int) $data['role_id'] !== $user->role_id) {
            throw new BusinessRuleException('You cannot change your own role.');
        }
        if ($data['username'] !== $user->username && empty($data['password'])) {
            throw new BusinessRuleException('Set a new password when changing the username.');
        }
        if (empty($data['password'])) {
            unset($data['password']);
        }

        return DB::transaction(function () use ($user, $data) {
            $roleChanged = (int) $data['role_id'] !== $user->role_id;
            $this->guardLastAdmin($user, (int) $data['role_id']);
            $user->update($data);
            if (isset($data['password'])) {
                $user->tokens()->delete(); // force sign-in with the new password
            }
            Audit::log('users', 'User updated', $user->name.($roleChanged ? ' — role → '.$user->fresh()->role->name : '').(isset($data['password']) ? ' — password reset' : ''));

            return response()->json(['data' => $this->row($user->fresh('role'))]);
        });
    }

    public function setActive(Request $request, User $user): JsonResponse
    {
        $active = $request->validate(['active' => ['required', 'boolean']])['active'];
        if ($user->is($request->user())) {
            throw new BusinessRuleException('You cannot deactivate your own account.');
        }
        if (! $active) {
            $this->guardLastAdmin($user, null);
        }
        $user->update(['active' => $active]);
        if (! $active) {
            $user->tokens()->delete(); // signed out everywhere immediately
        }
        Audit::log('users', $active ? 'User activated' : 'User deactivated', $user->name);

        return response()->json(['data' => $this->row($user->load('role'))]);
    }

    private function validated(Request $request, ?User $user = null): array
    {
        $request->merge(['username' => strtolower(trim((string) $request->input('username')))]);

        return $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'username' => ['required', 'string', 'min:3', 'max:60', 'regex:/^[a-z0-9._]+$/', Rule::unique('users')->ignore($user?->id)],
            'role_id' => ['required', 'integer', Rule::exists('roles', 'id')],
            'password' => [$user ? 'nullable' : 'required', 'string', Password::min(8)],
            'phone' => ['nullable', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:120', Rule::unique('users')->ignore($user?->id)],
        ], ['username.regex' => 'Username may contain only letters, numbers, dots and underscores.']);
    }

    /** At least one active administrator must always remain. */
    private function guardLastAdmin(User $user, ?int $newRoleId): void
    {
        if (! $user->isAdmin()) {
            return;
        }
        $stillAdmin = $newRoleId !== null && Role::find($newRoleId)?->is_admin;
        if ($stillAdmin) {
            return;
        }
        $others = User::where('id', '!=', $user->id)->where('active', true)
            ->whereHas('role', fn ($q) => $q->where('is_admin', true))->count();
        if ($others === 0) {
            throw new BusinessRuleException('At least one active administrator is required.');
        }
    }

    private function row(User $u): array
    {
        return [
            'id' => $u->id, 'name' => $u->name, 'username' => $u->username, 'email' => $u->email, 'phone' => $u->phone,
            'role_id' => $u->role_id, 'role' => $u->role?->name, 'active' => $u->active, 'last_login_at' => $u->last_login_at,
        ];
    }
}
