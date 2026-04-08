export interface User {
  id: number;
  name: string;
  email: string;
}

export type UserRole = 'admin' | 'member' | 'guest';

export function createUser(name: string, email: string): User {
  return { id: Date.now(), name, email };
}
