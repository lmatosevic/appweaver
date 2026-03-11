import fsp from 'node:fs/promises';
import path from 'node:path';
import { generateKeyPair } from 'node:crypto';
import { promisify } from 'node:util';
import * as bcrypt from 'bcrypt';
import { requestContext } from '@fastify/request-context';
import { context } from '../context';
import { isResourceAuthModel, isResourceAuthService } from '../utils';
import { AuthUser, IResourceService, ResourceModel } from '../types';

export function resourceAuthModel(): ResourceModel | undefined {
  for (const model of context.resource.models.values()) {
    if (isResourceAuthModel(model)) {
      return model;
    }
  }
}

export function resourceAuthService():
  | IResourceService<AuthUser, AuthUser>
  | undefined {
  for (const service of context.resource.services.values()) {
    if (isResourceAuthService(service)) {
      return service as IResourceService<AuthUser, AuthUser>;
    }
  }
}

export function currentAuthUser(): AuthUser | null | undefined {
  return requestContext.get('authUser');
}

export async function ensureSecurityKeys(
  publicKeyPath: string,
  privateKeyPath: string,
  generateIfNotExists: boolean
): Promise<boolean> {
  try {
    await fsp.access(publicKeyPath, fsp.constants.F_OK);
    await fsp.access(privateKeyPath, fsp.constants.F_OK);
    return true;
  } catch (e) {
    if (!generateIfNotExists) {
      throw e;
    }
    await generateSecurityKeys(publicKeyPath, privateKeyPath);
    return false;
  }
}

export async function generateSecurityKeys(
  publicKeyPath: string,
  privateKeyPath: string
): Promise<void> {
  const { privateKey, publicKey } = await promisify(generateKeyPair)('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  await fsp.mkdir(path.dirname(publicKeyPath), { recursive: true });
  await fsp.writeFile(publicKeyPath, publicKey, 'utf8');

  await fsp.mkdir(path.dirname(privateKeyPath), { recursive: true });
  await fsp.writeFile(privateKeyPath, privateKey, 'utf8');
}

export async function loadSecurityKeys(
  publicKeyPath: string,
  privateKeyPath: string,
  generateIfNotExists: boolean
): Promise<{
  keysExisted: boolean;
  publicKey: string;
  privateKey: string;
}> {
  const keysExisted = await ensureSecurityKeys(
    publicKeyPath,
    privateKeyPath,
    generateIfNotExists
  );

  const publicKey = await fsp.readFile(publicKeyPath, 'utf8');
  const privateKey = await fsp.readFile(privateKeyPath, 'utf8');

  return { keysExisted, publicKey, privateKey };
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
  authUser: Partial<AuthUser>,
  password?: string,
  logout: boolean = false
): Promise<void> {
  if (password) {
    authUser.passwordHash = await hashPassword(password);
    if (logout) {
      authUser.logoutAt = new Date();
    }
    delete authUser['password'];
  }
}

export function hasRole(authUser: AuthUser, role: string): boolean {
  return authUser.roles.findIndex((r) => r.name === role) > -1;
}

export function hasRoles(
  authUser: AuthUser,
  roles: Array<string> | undefined,
  operator: 'or' | 'and' = 'or'
): boolean {
  if (!roles) {
    return true;
  }

  for (const role of roles) {
    const allowed = hasRole(authUser, role);

    if (allowed && operator === 'or') {
      return true;
    }

    if (!allowed && operator === 'and') {
      return false;
    }
  }

  return operator === 'and' || roles.length === 0;
}

export function hasPermission(authUser: AuthUser, permission: string): boolean {
  const permissions = authUser.roles.flatMap((r) => r.permissions);
  return permissions.findIndex((p) => p.name === permission) > -1;
}

export function hasPermissions(
  authUser: AuthUser,
  permissions: string[] | undefined,
  operator: 'or' | 'and' = 'or'
): boolean {
  if (!permissions) {
    return true;
  }

  for (const permission of permissions) {
    const allowed = hasPermission(authUser, permission);

    if (allowed && operator === 'or') {
      return true;
    }

    if (!allowed && operator === 'and') {
      return false;
    }
  }

  return operator === 'and' || permissions.length === 0;
}
