class User:
    def __init__(self, name: str, email: str):
        self.name = name
        self.email = email

    def display(self) -> str:
        return f"{self.name} <{self.email}>"


def create_user(name: str, email: str) -> User:
    return User(name, email)
