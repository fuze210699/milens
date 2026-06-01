class User:
    def __init__(self, name: str, email: str):
        self.name: str = name
        self.email: str = email


class UserRepo:
    def __init__(self):
        self.users: list = []

    def save(self, user: User) -> None:
        self.users.append(user)

    def find(self, email: str) -> User | None:
        for u in self.users:
            if u.email == email:
                return u
        return None
