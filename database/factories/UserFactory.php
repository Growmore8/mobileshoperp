<?php

namespace Database\Factories;

use App\Models\Role;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\User>
 */
class UserFactory extends Factory
{
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'username' => strtolower(Str::random(8)),
            'email' => fake()->unique()->safeEmail(),
            'password' => 'password123',
            'role_id' => fn () => Role::where('name', 'Sales Executive')->value('id') ?? Role::factory(),
            'active' => true,
        ];
    }

    public function role(string $name): static
    {
        return $this->state(fn () => ['role_id' => Role::where('name', $name)->value('id')]);
    }

    public function admin(): static
    {
        return $this->state(fn () => ['role_id' => Role::where('is_admin', true)->value('id')]);
    }

    public function inactive(): static
    {
        return $this->state(fn () => ['active' => false]);
    }
}
