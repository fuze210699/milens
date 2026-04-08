import { UserService } from './user-service';
import type { Config } from '../types';

export function handleLogin(username: string, password: string): boolean {
  const service = new UserService();
  return service.authenticate(username, password);
}

export async function handleLogout(userId: string): Promise<void> {
  const service = new UserService();
  await service.invalidateSession(userId);
}

const formatDate = (date: Date): string => {
  return date.toISOString();
};

export default formatDate;
