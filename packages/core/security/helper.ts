import { requestContext } from '@fastify/request-context';
import * as bcrypt from 'bcrypt';
import { Identity, Role } from '../types';

export function currentIdentity(): Identity | null | undefined {
  return requestContext.get('identity');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt();
  return bcrypt.hash(password, salt);
}

export async function checkPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function updatePasswordHash(
  identity: Partial<Identity>,
  password?: string,
  logout: boolean = false
): Promise<void> {
  if (password) {
    identity.passwordHash = await hashPassword(password);
    if (logout) {
      identity.logoutAt = new Date();
    }
    delete identity['password'];
  }
}

export function hasRole(identity: Identity, role: Role): boolean {
  return identity.roles.findIndex((a) => a === role) > -1;
}

export function hasRoles(
  identity: Identity,
  roles: Array<Role>,
  operator: 'or' | 'and' = 'or'
): boolean {
  for (const role of roles) {
    const allowed = hasRole(identity, role);

    if (allowed && operator === 'or') {
      return true;
    }

    if (!allowed && operator === 'and') {
      return false;
    }
  }

  return operator === 'and' || roles.length === 0;
}
