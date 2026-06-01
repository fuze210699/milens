pub struct User {
    pub name: String,
    pub email: String,
}

pub trait Storage<T> {
    fn store(&mut self, item: T);
}

pub struct UserRepo {
    pub users: Vec<User>,
}

impl UserRepo {
    pub fn new() -> Self {
        UserRepo { users: Vec::new() }
    }

    pub fn save(&mut self, user: &User) {
        self.users.push(User { name: user.name.clone(), email: user.email.clone() });
    }

    pub fn find(&self, email: &str) -> Option<&User> {
        self.users.iter().find(|u| u.email == email)
    }
}

impl Storage<User> for UserRepo {
    fn store(&mut self, user: User) {
        self.users.push(user);
    }
}
