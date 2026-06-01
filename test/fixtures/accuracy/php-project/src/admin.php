<?php

class AdminService extends UserService {
    public function adminRegister(string $name, string $email): User {
        return $this->register($name, $email);
    }
}
