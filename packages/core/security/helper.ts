import { requestContext } from '@fastify/request-context';
import * as bcrypt from 'bcrypt';
import { Identity } from '../types';

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

export function hasRole(identity: Identity, role: string): boolean {
  return identity.roles.findIndex((r) => r.name === role) > -1;
}

export function hasRoles(
  identity: Identity,
  roles: Array<string> | undefined,
  operator: 'or' | 'and' = 'or'
): boolean {
  if (!roles) {
    return true;
  }

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

export function hasPermission(identity: Identity, permission: string): boolean {
  const permissions = identity.roles.flatMap((r) => r.permissions);
  return permissions.findIndex((p) => p.name === permission) > -1;
}

export function hasPermissions(
  identity: Identity,
  permissions: string[] | undefined,
  operator: 'or' | 'and' = 'or'
): boolean {
  if (!permissions) {
    return true;
  }

  for (const permission of permissions) {
    const allowed = hasPermission(identity, permission);

    if (allowed && operator === 'or') {
      return true;
    }

    if (!allowed && operator === 'and') {
      return false;
    }
  }

  return operator === 'and' || permissions.length === 0;
}
