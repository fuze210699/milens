from models import User, create_user


class UserService:
    def __init__(self):
        self.users = []

    def register(self, name: str, email: str) -> User:
        user = create_user(name, email)
        self.users.append(user)
        return user

    def find_by_email(self, email: str):
        for u in self.users:
            if u.email == email:
                return u
        return None
