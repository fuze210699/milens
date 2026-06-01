export interface User {
  id: number;
  name: string;
  email: string;
}

export class UserRepository {
  private users: User[] = [];

  save(user: User): void {
    this.users.push(user);
  }

  findByEmail(email: string): User | undefined {
    return this.users.find(u => u.email === email);
  }
}
