import { createUser } from './models.js';
import type { User, UserRole } from './models.js';

export class AuthService {
  private users: User[] = [];

  register(name: string, email: string, role: UserRole): User {
    const user = createUser(name, email);
    this.users.push(user);
    return user;
  }

  findByEmail(email: string): User | undefined {
    return this.users.find(u => u.email === email);
  }

  validateToken(token: string): boolean {
    return token.length > 0;
  }
}

export function hashPassword(password: string): string {
  return Buffer.from(password).toString('base64');
}
