import * as bcrypt from 'bcrypt';
import { requestContext } from '@fastify/request-context';
import { AuthType, config, RESOURCE_NAME } from '@appweaver/common';
import { context, injectService } from '../context';
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
      return injectService(service[RESOURCE_NAME]);
    }
  }
}

export function currentAuthUser(): AuthUser | null | undefined {
  return requestContext.get('authUser');
}

export function authSchema(authTypes: AuthType[]): any[] {
  const authSchemas: any[] = [];

  for (const authType of authTypes) {
    switch (authType) {
      case AuthType.Basic:
        if (config.SECURITY_BASIC_ENABLED) {
          authSchemas.push({ basicAuth: [] });
        }
        break;
      case AuthType.ApiKey:
        if (config.SECURITY_API_KEY_ENABLED) {
          authSchemas.push({ apiKeyAuth: [] });
        }
        break;
      case AuthType.Jwt:
        authSchemas.push({ bearer: [] });
        break;
    }
  }

  return authSchemas;
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
  }
  delete authUser['password'];
}

export function hasRole(authUser: AuthUser, role: string): boolean {
  return authUser.roles.some((r) => r.name === role);
}

export function hasRoles(
  authUser: AuthUser,
  roles: Array<string> | undefined,
  operator: 'or' | 'and' = 'or'
): boolean {
  if (!roles) {
    return true;
  }

  const predicate = (role: string) => hasRole(authUser, role);

  return operator === 'and' ? roles.every(predicate) : roles.some(predicate);
}

export function hasPermission(authUser: AuthUser, permission: string): boolean {
  return authUser.roles
    .flatMap((r) => r.permissions)
    .some((p) => p.name === permission);
}

export function hasPermissions(
  authUser: AuthUser,
  permissions: string[] | undefined,
  operator: 'or' | 'and' = 'or'
): boolean {
  if (!permissions) {
    return true;
  }

  const predicate = (perm: string) => hasPermission(authUser, perm);

  return operator === 'and'
    ? permissions.every(predicate)
    : permissions.some(predicate);
}
