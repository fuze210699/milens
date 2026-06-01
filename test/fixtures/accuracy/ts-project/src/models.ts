export interface User {
  id: number;
  name: string;
  email: string;
}

export interface Repository<T> {
  save(item: T): void;
  findByEmail(email: string): T | undefined;
}

export class UserRepository implements Repository<User> {
  private users: User[] = [];

  save(user: User): void {
    this.users.push(user);
  }

  findByEmail(email: string): User | undefined {
    return this.users.find(u => u.email === email);
  }
}
