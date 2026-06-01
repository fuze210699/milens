mod models;

use models::{User, UserRepo};

pub struct UserService {
    repo: UserRepo,
}

impl UserService {
    pub fn new(repo: UserRepo) -> Self {
        UserService { repo }
    }

    pub fn register(&mut self, name: String, email: String) -> User {
        let user = User { name, email };
        self.repo.save(&user);
        user
    }
}
