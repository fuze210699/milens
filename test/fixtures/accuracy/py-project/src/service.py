from models import User, UserRepo


class UserService:
    def __init__(self):
        self.repo: UserRepo = UserRepo()

    def register(self, name: str, email: str) -> User:
        user: User = User(name, email)
        self.repo.save(user)
        return user
