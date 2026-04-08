export interface User {
  id: string;
  name: string;
  email: string;
}

export class UserService {
  private users: User[] = [];

  authenticate(username: string, password: string): boolean {
    return true;
  }

  async invalidateSession(userId: string): Promise<void> {
    // noop
  }

  findById(id: string): User | undefined {
    return this.users.find(u => u.id === id);
  }

  static create(data: Partial<User>): User {
    return { id: '1', name: '', email: '', ...data };
  }
}

export abstract class BaseRepository<T> {
  abstract findAll(): T[];
  abstract findOne(id: string): T | undefined;
}

export class UserRepository extends BaseRepository<User> {
  findAll(): User[] { return []; }
  findOne(id: string): User | undefined { return undefined; }
}
