import {
  AuthScope,
  AuthSource,
  AuthUser,
  config,
  RESOURCE_AUTH,
  RESOURCE_MODEL_TYPE,
  RESOURCE_SERVICE_TYPE,
  RESOURCE_TYPE,
  RESOURCE_NAME
} from '@appweaver/common';
import { define } from '../../context';
import { createAuthService } from '../../security/create-auth-resources';
import { HttpError } from '../../errors';
import {
  checkPassword,
  checkScopeAccess,
  hasPermission,
  hasPermissions,
  hashPassword,
  hasRole,
  hasRoles,
  isOAuth2Enabled,
  resourceAuthModel,
  resourceAuthService,
  updatePasswordHash,
  validatePasswordComplexity,
  validateRedirectUrl
} from '../../security/helper';
import { resetContext } from '../fixtures/context-fixture';

const authUser = (roles: any[] = []): AuthUser =>
  ({ id: 1, roles }) as AuthUser;

const role = (name: string, permissions: string[] = []) => ({
  name,
  permissions: permissions.map((p) => ({ name: p }))
});

describe('security-helper', () => {
  beforeEach(() => {
    resetContext();
  });

  afterAll(() => {
    resetContext();
  });

  describe('validatePasswordComplexity', () => {
    test('accepts a password satisfying every rule', () => {
      expect(validatePasswordComplexity('Str0ng!Pass')).toEqual({
        valid: true,
        message: 'OK'
      });
    });

    test('rejects a password shorter than the minimum length', () => {
      const result = validatePasswordComplexity('Ab1!');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('at least 8 characters long');
    });

    test('rejects a password longer than the maximum length', () => {
      const result = validatePasswordComplexity(`Ab1!${'a'.repeat(200)}`);

      expect(result.valid).toBe(false);
      expect(result.message).toContain('must not be longer than');
    });

    test('rejects a password without an uppercase character', () => {
      const result = validatePasswordComplexity('str0ng!pass');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('uppercase');
    });

    test('rejects a password without a lowercase character', () => {
      const result = validatePasswordComplexity('STR0NG!PASS');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('lowercase');
    });

    test('rejects a password without a numeric character', () => {
      const result = validatePasswordComplexity('Strong!Pass');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('numeric');
    });

    test('rejects a password without a special character', () => {
      const result = validatePasswordComplexity('Str0ngPass');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('special');
    });
  });

  describe('hashPassword / checkPassword', () => {
    test('hashes a password into a bcrypt hash', async () => {
      const hash = await hashPassword('Str0ng!Pass');

      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
      expect(hash).not.toContain('Str0ng!Pass');
    });

    test('produces a different hash for the same password', async () => {
      const [first, second] = await Promise.all([
        hashPassword('Str0ng!Pass'),
        hashPassword('Str0ng!Pass')
      ]);

      expect(first).not.toBe(second);
    });

    test('verifies a matching password', async () => {
      const hash = await hashPassword('Str0ng!Pass');

      await expect(checkPassword('Str0ng!Pass', hash)).resolves.toBe(true);
    });

    test('rejects a wrong password', async () => {
      const hash = await hashPassword('Str0ng!Pass');

      await expect(checkPassword('wrong', hash)).resolves.toBe(false);
    });
  });

  describe('updatePasswordHash', () => {
    test('sets the password hash and removes the plain password', async () => {
      const user: any = { id: 1, password: 'Str0ng!Pass' };

      await updatePasswordHash(user, 'Str0ng!Pass');

      expect(user.password).toBeUndefined();
      expect(user.passwordHash).toBeDefined();
      await expect(
        checkPassword('Str0ng!Pass', user.passwordHash)
      ).resolves.toBe(true);
    });

    test('does not set a logout timestamp by default', async () => {
      const user: any = {};

      await updatePasswordHash(user, 'Str0ng!Pass');

      expect(user.logoutAt).toBeUndefined();
    });

    test('sets the logout timestamp when requested', async () => {
      const user: any = {};

      await updatePasswordHash(user, 'Str0ng!Pass', true);

      expect(user.logoutAt).toBeInstanceOf(Date);
    });

    test('only removes the plain password when no password is given', async () => {
      const user: any = { password: 'ignored', passwordHash: 'existing' };

      await updatePasswordHash(user);

      expect(user.password).toBeUndefined();
      expect(user.passwordHash).toBe('existing');
    });

    test('throws for a password that does not satisfy the complexity rules', async () => {
      await expect(updatePasswordHash({}, 'weak')).rejects.toThrow(HttpError);
      await expect(updatePasswordHash({}, 'weak')).rejects.toThrow(
        'at least 8 characters long'
      );
    });
  });

  describe('validateRedirectUrl', () => {
    test('accepts any host by default', () => {
      expect(validateRedirectUrl('https://example.com/callback')).toEqual({
        valid: true,
        message: 'URL is valid and allowed'
      });
    });

    test('rejects a malformed URL', () => {
      const result = validateRedirectUrl('not-a-url');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid URL format');
    });

    test('rejects an empty URL', () => {
      expect(validateRedirectUrl('').valid).toBe(false);
    });
  });

  describe('isOAuth2Enabled', () => {
    const providerFlags = Object.values(AuthSource)
      .filter((source) => source.startsWith('oauth2'))
      .map(
        (source) =>
          `SECURITY_OAUTH2_${source.replace('oauth2', '').toUpperCase()}_ENABLED`
      );

    test('resolves a config flag for every OAuth2 auth source', () => {
      // A provider whose flag is missing would silently never enable the connected accounts table
      for (const flag of providerFlags) {
        expect(config).toHaveProperty(flag);
      }
    });

    test('reports disabled when no provider is turned on', () => {
      expect(providerFlags.some((flag) => config[flag] === true)).toBe(false);
      expect(isOAuth2Enabled()).toBe(false);
    });

    test('ignores the general OAuth2 flags that are on by default', () => {
      expect(config.SECURITY_OAUTH2_REGISTRATION_ENABLED).toBe(true);
      expect(providerFlags).not.toContain(
        'SECURITY_OAUTH2_REGISTRATION_ENABLED'
      );
    });
  });

  describe('checkScopeAccess', () => {
    test('allows a regular route for the auth scope', () => {
      expect(checkScopeAccess('/api/posts', AuthScope.Auth)).toBe(true);
    });

    test('blocks the refresh route for the auth scope', () => {
      expect(checkScopeAccess('/auth/refresh', AuthScope.Auth)).toBe(false);
    });

    test('allows only the refresh route for the refresh scope', () => {
      expect(checkScopeAccess('/auth/refresh', AuthScope.Refresh)).toBe(true);
      expect(checkScopeAccess('/api/posts', AuthScope.Refresh)).toBe(false);
      expect(checkScopeAccess('/auth/me', AuthScope.Refresh)).toBe(false);
    });

    test('allows the 2FA verification route only for the 2FA scope', () => {
      expect(
        checkScopeAccess('/auth/account/verify-2fa-code', AuthScope.TwoFA)
      ).toBe(true);
      expect(
        checkScopeAccess('/auth/account/verify-2fa-code', AuthScope.Auth)
      ).toBe(false);
      expect(checkScopeAccess('/api/posts', AuthScope.TwoFA)).toBe(false);
    });

    test('allows the 2FA code request route only for the 2FA scope', () => {
      expect(
        checkScopeAccess('/auth/account/send-2fa-code', AuthScope.TwoFA)
      ).toBe(true);
      expect(
        checkScopeAccess('/auth/account/send-2fa-code', AuthScope.Auth)
      ).toBe(false);
      expect(
        checkScopeAccess('/auth/account/send-2fa-code', AuthScope.Refresh)
      ).toBe(false);
    });

    test('denies access for an unknown scope', () => {
      expect(checkScopeAccess('/api/posts', 'unknown' as AuthScope)).toBe(
        false
      );
    });
  });

  describe('hasRole', () => {
    test('detects an assigned role', () => {
      expect(hasRole(authUser([role('Admin')]), 'Admin')).toBe(true);
    });

    test('returns false for a missing role', () => {
      expect(hasRole(authUser([role('User')]), 'Admin')).toBe(false);
      expect(hasRole(authUser(), 'Admin')).toBe(false);
    });
  });

  describe('hasRoles', () => {
    const user = authUser([role('User'), role('Editor')]);

    test('returns true when no roles are required', () => {
      expect(hasRoles(user, undefined)).toBe(true);
    });

    test('matches any role with the or operator', () => {
      expect(hasRoles(user, ['Admin', 'Editor'])).toBe(true);
      expect(hasRoles(user, ['Admin'])).toBe(false);
    });

    test('requires every role with the and operator', () => {
      expect(hasRoles(user, ['User', 'Editor'], 'and')).toBe(true);
      expect(hasRoles(user, ['User', 'Admin'], 'and')).toBe(false);
    });

    test('returns false for an empty role list with the or operator', () => {
      expect(hasRoles(user, [])).toBe(false);
      expect(hasRoles(user, [], 'and')).toBe(true);
    });
  });

  describe('hasPermission', () => {
    test('detects a permission granted through a role', () => {
      const user = authUser([role('Editor', ['post:write'])]);

      expect(hasPermission(user, 'post:write')).toBe(true);
      expect(hasPermission(user, 'post:delete')).toBe(false);
    });

    test('collects permissions from every role', () => {
      const user = authUser([
        role('Reader', ['post:read']),
        role('Editor', ['post:write'])
      ]);

      expect(hasPermission(user, 'post:read')).toBe(true);
      expect(hasPermission(user, 'post:write')).toBe(true);
    });
  });

  describe('hasPermissions', () => {
    const user = authUser([role('Editor', ['post:read', 'post:write'])]);

    test('returns true when no permissions are required', () => {
      expect(hasPermissions(user, undefined)).toBe(true);
    });

    test('matches any permission with the or operator', () => {
      expect(hasPermissions(user, ['post:delete', 'post:read'])).toBe(true);
      expect(hasPermissions(user, ['post:delete'])).toBe(false);
    });

    test('requires every permission with the and operator', () => {
      expect(hasPermissions(user, ['post:read', 'post:write'], 'and')).toBe(
        true
      );
      expect(hasPermissions(user, ['post:read', 'post:delete'], 'and')).toBe(
        false
      );
    });
  });

  describe('resourceAuthModel', () => {
    test('returns the model flagged as the auth model', () => {
      const user = {
        name: 'User',
        config: { name: 'User' },
        [RESOURCE_TYPE]: RESOURCE_MODEL_TYPE,
        [RESOURCE_AUTH]: true
      } as any;
      const post = {
        name: 'Post',
        config: { name: 'Post' },
        [RESOURCE_TYPE]: RESOURCE_MODEL_TYPE
      } as any;

      define(post);
      define(user);

      expect(resourceAuthModel()).toBe(user);
    });

    test('returns undefined without an auth model', () => {
      define({
        name: 'Post',
        config: { name: 'Post' },
        [RESOURCE_TYPE]: RESOURCE_MODEL_TYPE
      } as any);

      expect(resourceAuthModel()).toBeUndefined();
    });
  });

  describe('resourceAuthService', () => {
    test('returns the service flagged as the auth service', () => {
      const userService = {
        modelName: 'User',
        [RESOURCE_TYPE]: RESOURCE_SERVICE_TYPE,
        [RESOURCE_AUTH]: true,
        [RESOURCE_NAME]: 'User'
      } as any;

      define(userService, 'User');

      expect(resourceAuthService()).toBe(userService);
    });

    test('returns undefined without an auth service', () => {
      expect(resourceAuthService()).toBeUndefined();
    });

    test('still resolves an auth service that was replaced by its instance', () => {
      const service = createAuthService({ modelName: 'User' });

      // The context swaps the class for its instance on the first injection. Mirrored here without a database, since
      // every later caller has to keep finding it: the auth marker must be reachable from an instance, not just the
      // class.
      const instance = Object.create(service.prototype);
      instance[RESOURCE_TYPE] = RESOURCE_SERVICE_TYPE;
      instance[RESOURCE_NAME] = 'User';

      define(instance, 'User', 'override');

      expect(resourceAuthService()).toBe(instance);
    });
  });
});
