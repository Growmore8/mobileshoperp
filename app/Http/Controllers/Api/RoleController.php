<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Services\Audit;
use App\Support\Permissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RoleController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => Role::withCount('users')->orderByDesc('is_admin')->orderBy('id')->get(),
            'modules' => Permissions::MODULES,
            'actions' => Permissions::ACTIONS,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $role = Role::create(['name' => $data['name'], 'description' => $data['description'] ?? null, 'is_admin' => false, 'permissions' => Permissions::sanitize($data['permissions'] ?? [])]);
        Audit::log('users', 'Role created', $role->name);

        return response()->json(['data' => $role], 201);
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        if ($role->is_admin) {
            throw new BusinessRuleException('The Administrator role always has full access and cannot be edited.');
        }
        $data = $this->validated($request, $role);
        $new = Permissions::sanitize($data['permissions'] ?? []);

        // human-readable diff for the audit log, e.g. "Sales & Invoices: +refund −cancel"
        $diff = [];
        foreach (Permissions::MODULES as $key => $def) {
            $old = $role->permissions[$key] ?? [];
            $add = array_diff($new[$key] ?? [], $old);
            $rem = array_diff($old, $new[$key] ?? []);
            if ($add || $rem) {
                $diff[] = $def['label'].': '.implode(' ', array_merge(array_map(fn ($a) => "+$a", $add), array_map(fn ($a) => "−$a", $rem)));
            }
        }
        $role->update(['name' => $data['name'], 'description' => $data['description'] ?? null, 'permissions' => $new]);
        Audit::log('users', 'Permissions changed', $role->name.($diff ? ' — '.implode('; ', $diff) : ' (no permission changes)'));

        return response()->json(['data' => $role->loadCount('users')]);
    }

    public function destroy(Role $role): JsonResponse
    {
        if ($role->is_admin) {
            throw new BusinessRuleException('The Administrator role cannot be deleted.');
        }
        if ($role->users()->exists()) {
            throw new BusinessRuleException('Reassign the users of this role before deleting it.');
        }
        $role->delete();
        Audit::log('users', 'Role deleted', $role->name);

        return response()->json(['message' => 'Role deleted.']);
    }

    private function validated(Request $request, ?Role $role = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:80', Rule::unique('roles')->ignore($role?->id)],
            'description' => ['nullable', 'string', 'max:255'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['array'],
            'permissions.*.*' => ['string', Rule::in(Permissions::ACTIONS)],
        ]);
    }
}
