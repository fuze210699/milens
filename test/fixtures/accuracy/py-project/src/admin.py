from service import UserService
from models import User


class AdminService(UserService):
    def ban_user(self, email: str) -> None:
        user: User = User("banned", email)
        self.repo.save(user)

    def register_admin(self, name: str, email: str) -> User:
        return self.register(name, email)
