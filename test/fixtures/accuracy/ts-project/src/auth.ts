import { UserRepository } from './models.js';
import type { User } from './models.js';

const repo = new UserRepository();

export function registerUser(name: string, email: string): User {
  const user: User = { id: Date.now(), name, email };
  repo.save(user);
  return user;
}
