<?php

class User {
    public string $name;
    public string $email;

    public function __construct(string $name, string $email) {
        $this->name = $name;
        $this->email = $email;
    }
}

interface Repository {
    public function save(object $item): void;
}

class UserRepository implements Repository {
    private array $users = [];

    public function save(object $item): void {
        $this->users[] = $item;
    }

    public function findByEmail(string $email): ?User {
        foreach ($this->users as $user) {
            if ($user->email === $email) return $user;
        }
        return null;
    }
}
