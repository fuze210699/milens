use models::{User, UserRepo};

pub struct AdminService {
    repo: UserRepo,
}

impl AdminService {
    pub fn new() -> Self {
        AdminService { repo: UserRepo::new() }
    }

    pub fn manage(&mut self, name: String, email: String) -> User {
        let user = User { name, email };
        self.repo.save(&user);
        user
    }
}
