<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Role extends Model
{
    protected $fillable = ['name', 'description', 'is_admin', 'permissions'];

    protected function casts(): array
    {
        return ['is_admin' => 'boolean', 'permissions' => 'array'];
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function allows(string $module, string $action): bool
    {
        return $this->is_admin || in_array($action, $this->permissions[$module] ?? [], true);
    }
}
