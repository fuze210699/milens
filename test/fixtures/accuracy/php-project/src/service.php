<?php

class UserService {
    private UserRepository $repo;

    public function __construct() {
        $this->repo = new UserRepository();
    }

    public function register(string $name, string $email): User {
        $user = new User($name, $email);
        $this->repo->save($user);
        return $user;
    }
}
