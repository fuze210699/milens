<?php

namespace App\Models;

use App\Services\AuthService;

abstract class BaseModel
{
    protected string $table;

    abstract public function save(): bool;
}

class User extends BaseModel implements \JsonSerializable
{
    public string $name;
    public string $email;
    private int $id;
    protected string $password;

    public function __construct(string $name, string $email)
    {
        $this->name = $name;
        $this->email = $email;
    }

    public function save(): bool
    {
        return true;
    }

    public static function find(int $id): ?self
    {
        return null;
    }

    public function jsonSerialize(): mixed
    {
        return ['name' => $this->name, 'email' => $this->email];
    }

    private function hashPassword(string $raw): string
    {
        return password_hash($raw, PASSWORD_DEFAULT);
    }
}

function formatUserName(User $user): string
{
    return strtoupper($user->name);
}
