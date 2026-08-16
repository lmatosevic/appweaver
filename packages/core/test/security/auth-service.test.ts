import {
  AuthOTTPurpose,
  AuthScope,
  AuthSource,
  AuthUser,
  CONFIG,
  RESOURCE_AUTH,
  RESOURCE_MODEL_TYPE,
  RESOURCE_NAME,
  RESOURCE_SERVICE_TYPE,
  RESOURCE_TYPE,
  SecurityStore,
  config
} from '@appweaver/common';
import { context, define } from '../../context';
import { CacheService } from '../../cache';
import { FileService } from '../../storage/file-service';
import { HttpError } from '../../errors';
import { AuthService } from '../../security/auth-service';
import { OAuth2Service } from '../../security/oauth2/oauth2-service';
import { hashPassword } from '../../security/helper';
import { resetContext } from '../fixtures/context-fixture';

describe('auth-service', () => {
  let authUserService: any;
  let securityStore: any;
  let connectedAccountService: any;
  let cacheService: any;
  let fileService: any;
  let signedTokens: any[];
  let service: AuthService;

  const user = (overrides: Partial<AuthUser> = {}): AuthUser => ({
    id: 1,
    email: 'user@test.com',
    enabled: true,
    roles: [],
    twoFactorAuth: 'None',
    ...overrides
  });

  beforeEach(() => {
    resetContext();

    authUserService = {
      modelName: 'User',
      client: { name: 'User' },
      find: jest.fn(),
      query: jest.fn().mockResolvedValue({ items: [] }),
      create: jest.fn(),
      update: jest
        .fn()
        .mockImplementation(async (id, data) => ({ id, ...data })),
      [RESOURCE_TYPE]: RESOURCE_SERVICE_TYPE,
      [RESOURCE_AUTH]: true,
      [RESOURCE_NAME]: 'User',
      [CONFIG]: {}
    };
    define(authUserService, 'User');

    context.resource.models.set('User', {
      name: 'User',
      [RESOURCE_TYPE]: RESOURCE_MODEL_TYPE,
      [RESOURCE_AUTH]: true
    } as any);

    connectedAccountService = {
      modelName: 'ConnectedAccount',
      query: jest.fn().mockResolvedValue({ items: [] }),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({ id: 1 })
    };
    context.resource.services.set('ConnectedAccount', connectedAccountService);

    securityStore = {
      useOneTimeToken: jest.fn(),
      createOneTimeToken: jest.fn()
    };
    define(securityStore, SecurityStore as any);

    cacheService = {
      buildCacheKey: jest.fn().mockImplementation((data: any) => data.baseKey),
      getCachedValue: jest.fn().mockResolvedValue(null),
      addToCache: jest.fn().mockResolvedValue(true),
      removeCachedValue: jest.fn().mockResolvedValue(true)
    };
    define(cacheService, CacheService);

    fileService = {
      saveBuffer: jest.fn().mockResolvedValue({ id: 1 })
    };
    define(fileService, FileService);

    // exchangeToken delegates the OAuth2 account linking to it
    define(new OAuth2Service(), OAuth2Service);

    signedTokens = [];
    context.server = {
      jwt: {
        sign: (payload: any, options: any) => {
          signedTokens.push({ payload, options });
          return `token-${signedTokens.length}`;
        }
      }
    } as any;

    service = new AuthService();
  });

  afterAll(() => {
    resetContext();
  });

  describe('findById', () => {
    test('returns the cached user without querying the service', async () => {
      cacheService.getCachedValue.mockResolvedValue(user());

      await expect(service.findById(1)).resolves.toMatchObject({ id: 1 });
      expect(authUserService.find).not.toHaveBeenCalled();
    });

    test('loads and caches the user on a cache miss', async () => {
      authUserService.find.mockResolvedValue(user());

      await expect(service.findById(1)).resolves.toMatchObject({ id: 1 });

      expect(authUserService.find).toHaveBeenCalledWith(1);
      expect(cacheService.addToCache).toHaveBeenCalledWith(
        'auth:1',
        expect.objectContaining({ id: 1 }),
        config.SECURITY_CACHE_TTL
      );
    });

    test('wraps a lookup failure into a server error', async () => {
      authUserService.find.mockRejectedValue(new Error('db down'));

      await expect(service.findById(1)).rejects.toMatchObject({
        statusCode: 500,
        message: expect.stringContaining('find error')
      });
    });
  });

  describe('findByUsername', () => {
    test('queries the user by email', async () => {
      authUserService.query.mockResolvedValue({ items: [user()] });

      await expect(
        service.findByUsername('user@test.com')
      ).resolves.toMatchObject({ id: 1 });
      expect(authUserService.query).toHaveBeenCalledWith({
        email: 'user@test.com'
      });
    });

    test('returns null when no user matches', async () => {
      await expect(
        service.findByUsername('missing@test.com')
      ).resolves.toBeNull();
    });

    test('does not cache a missing user', async () => {
      await service.findByUsername('missing@test.com');

      expect(cacheService.addToCache).not.toHaveBeenCalled();
    });

    test('returns the cached user', async () => {
      cacheService.getCachedValue.mockResolvedValue(user());

      await expect(
        service.findByUsername('user@test.com')
      ).resolves.toMatchObject({ id: 1 });
      expect(authUserService.query).not.toHaveBeenCalled();
    });
  });

  describe('authenticate', () => {
    test('returns the user for valid credentials', async () => {
      const passwordHash = await hashPassword('Str0ng!Pass');
      authUserService.query.mockResolvedValue({
        items: [user({ passwordHash })]
      });

      await expect(
        service.authenticate('user@test.com', 'Str0ng!Pass')
      ).resolves.toMatchObject({ id: 1 });
    });

    test('rejects an unknown user', async () => {
      await expect(
        service.authenticate('missing@test.com', 'Str0ng!Pass')
      ).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('does not exist or is disabled')
      });
    });

    test('rejects a disabled user', async () => {
      const passwordHash = await hashPassword('Str0ng!Pass');
      authUserService.query.mockResolvedValue({
        items: [user({ passwordHash, enabled: false })]
      });

      await expect(
        service.authenticate('user@test.com', 'Str0ng!Pass')
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('rejects a user without a password hash', async () => {
      authUserService.query.mockResolvedValue({ items: [user()] });

      await expect(
        service.authenticate('user@test.com', 'Str0ng!Pass')
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('rejects an invalid password', async () => {
      const passwordHash = await hashPassword('Str0ng!Pass');
      authUserService.query.mockResolvedValue({
        items: [user({ passwordHash })]
      });

      await expect(
        service.authenticate('user@test.com', 'wrong')
      ).rejects.toMatchObject({
        statusCode: 401,
        message: expect.stringContaining('Invalid user credentials')
      });
    });
  });

  describe('authorize', () => {
    test('allows an enabled user without route restrictions', () => {
      expect(() => service.authorize(user(), '/api/posts')).not.toThrow();
    });

    test('rejects a missing user', () => {
      expect(() => service.authorize(null, '/api/posts')).toThrow(
        'Unauthorized access'
      );
    });

    test('rejects a disabled user', () => {
      expect(() =>
        service.authorize(user({ enabled: false }), '/api/posts')
      ).toThrow('Unauthorized access');
    });

    test('rejects a token issued before the last logout', () => {
      const logoutAt = new Date();

      expect(() =>
        service.authorize(user({ logoutAt }), '/api/posts', {}, {
          scope: AuthScope.Auth,
          iat: logoutAt.getTime() - 1000
        } as any)
      ).toThrow('Unauthorized access');
    });

    test('accepts a token issued after the last logout', () => {
      const logoutAt = new Date();

      expect(() =>
        service.authorize(user({ logoutAt }), '/api/posts', {}, {
          scope: AuthScope.Auth,
          iat: logoutAt.getTime() + 1000
        } as any)
      ).not.toThrow();
    });

    test('rejects a token whose scope does not allow the url', () => {
      expect(() =>
        service.authorize(user(), '/auth/refresh', {}, {
          scope: AuthScope.Auth,
          iat: Date.now()
        } as any)
      ).toThrow('not authorized to access requested URL');
    });

    test('rejects a user without the required role', () => {
      expect(() =>
        service.authorize(user(), '/api/posts', { roles: ['Admin'] })
      ).toThrow('Forbidden access');
    });

    test('accepts a user with the required role', () => {
      const admin = user({
        roles: [{ name: 'Admin', permissions: [] }] as any
      });

      expect(() =>
        service.authorize(admin, '/api/posts', { roles: ['Admin'] })
      ).not.toThrow();
    });

    test('rejects a user without the required permission', () => {
      expect(() =>
        service.authorize(user(), '/api/posts', { permissions: ['post:write'] })
      ).toThrow('Forbidden access');
    });
  });

  describe('login', () => {
    test('returns the access and refresh tokens', async () => {
      const passwordHash = await hashPassword('Str0ng!Pass');
      authUserService.query.mockResolvedValue({
        items: [user({ passwordHash })]
      });

      const tokens = await service.login('user@test.com', 'Str0ng!Pass');

      expect(tokens.accessToken).toBe('token-1');
      expect(tokens.refreshToken).toBe('token-2');
      expect(tokens.expiresIn).toBe(config.SECURITY_JWT_EXPIRES_IN);
      expect(tokens.refreshExpiresIn).toBe(
        config.SECURITY_JWT_REFRESH_EXPIRES_IN
      );
    });

    test('signs the access token with the auth scope', async () => {
      const passwordHash = await hashPassword('Str0ng!Pass');
      authUserService.query.mockResolvedValue({
        items: [user({ passwordHash })]
      });

      await service.login('user@test.com', 'Str0ng!Pass');

      expect(signedTokens[0].payload).toMatchObject({
        scope: AuthScope.Auth,
        source: AuthSource.Password,
        sub: 1,
        username: 'user@test.com'
      });
      expect(signedTokens[1].payload.scope).toBe(AuthScope.Refresh);
    });

    test('issues a 2FA scoped token for a user with 2FA enabled', async () => {
      const passwordHash = await hashPassword('Str0ng!Pass');
      authUserService.query.mockResolvedValue({
        items: [user({ passwordHash, twoFactorAuth: 'Email' } as any)]
      });

      await service.login('user@test.com', 'Str0ng!Pass');

      expect(signedTokens[0].payload.scope).toBe(AuthScope.TwoFA);
    });
  });

  describe('generateAuthTokens', () => {
    test('keeps the given scope and source', async () => {
      await service.generateAuthTokens(
        user(),
        AuthScope.Auth,
        AuthSource.OAuth2Google
      );

      expect(signedTokens[0].payload.source).toBe(AuthSource.OAuth2Google);
    });

    test('throws when the server is not initialized', async () => {
      context.server = null;

      await expect(service.generateAuthTokens(user())).rejects.toThrow(
        'Server instance not initialized'
      );
    });
  });

  describe('exchangeToken', () => {
    test('exchanges a valid one time token for auth tokens', async () => {
      securityStore.useOneTimeToken.mockResolvedValue({
        authUserId: 1,
        authSource: AuthSource.OAuth2Google
      });
      authUserService.find.mockResolvedValue(user());

      const tokens = await service.exchangeToken('ott-token');

      expect(securityStore.useOneTimeToken).toHaveBeenCalledWith(
        'ott-token',
        AuthOTTPurpose.Authentication
      );
      expect(tokens.accessToken).toBe('token-1');
      expect(signedTokens[0].payload.source).toBe(AuthSource.OAuth2Google);
    });

    test('rejects a token of a disabled user', async () => {
      securityStore.useOneTimeToken.mockResolvedValue({
        authUserId: 1,
        authSource: AuthSource.Password
      });
      authUserService.find.mockResolvedValue(user({ enabled: false }));

      await expect(service.exchangeToken('ott-token')).rejects.toMatchObject({
        statusCode: 400
      });
    });

    test('links the provider account after a successful exchange', async () => {
      securityStore.useOneTimeToken.mockResolvedValue({
        authUserId: 1,
        authSource: AuthSource.OAuth2Google,
        providerAccountId: '42',
        scope: 'profile email'
      });
      authUserService.find.mockResolvedValue(user());

      await service.exchangeToken('ott-token');

      expect(connectedAccountService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: AuthSource.OAuth2Google,
          providerAccountId: '42',
          scope: 'profile email'
        })
      );
    });

    test('marks an unverified email as verified after an OAuth2 exchange', async () => {
      securityStore.useOneTimeToken.mockResolvedValue({
        authUserId: 1,
        authSource: AuthSource.OAuth2Google,
        providerAccountId: '42'
      });
      authUserService.find.mockResolvedValue(user({ verifiedEmail: false }));

      await service.exchangeToken('ott-token');

      expect(authUserService.update).toHaveBeenCalledWith(1, {
        verifiedEmail: true
      });
    });

    test('leaves an already verified email untouched', async () => {
      securityStore.useOneTimeToken.mockResolvedValue({
        authUserId: 1,
        authSource: AuthSource.OAuth2Google,
        providerAccountId: '42'
      });
      authUserService.find.mockResolvedValue(user({ verifiedEmail: true }));

      await service.exchangeToken('ott-token');

      expect(authUserService.update).not.toHaveBeenCalled();
    });

    test('does not verify the email when the confirmation fails', async () => {
      securityStore.useOneTimeToken.mockResolvedValue({
        authUserId: 1,
        authSource: AuthSource.OAuth2Google,
        providerAccountId: '42',
        passwordRequired: true
      });
      authUserService.find.mockResolvedValue(
        user({
          verifiedEmail: false,
          passwordHash: await hashPassword('Str0ng!Pass')
        })
      );

      await expect(
        service.exchangeToken('ott-token', 'WrongPass1!')
      ).rejects.toMatchObject({ statusCode: 401 });
      expect(authUserService.update).not.toHaveBeenCalled();
    });

    test('rejects a flagged token when no password is supplied', async () => {
      securityStore.useOneTimeToken.mockResolvedValue({
        authUserId: 1,
        authSource: AuthSource.OAuth2Google,
        providerAccountId: '42',
        passwordRequired: true
      });
      authUserService.find.mockResolvedValue(
        user({ passwordHash: await hashPassword('Str0ng!Pass') })
      );

      await expect(service.exchangeToken('ott-token')).rejects.toMatchObject({
        statusCode: 401,
        message: expect.stringContaining('Password confirmation is required')
      });
      expect(connectedAccountService.create).not.toHaveBeenCalled();
    });

    test('rejects a flagged token when the password is wrong', async () => {
      securityStore.useOneTimeToken.mockResolvedValue({
        authUserId: 1,
        authSource: AuthSource.OAuth2Google,
        providerAccountId: '42',
        passwordRequired: true
      });
      authUserService.find.mockResolvedValue(
        user({ passwordHash: await hashPassword('Str0ng!Pass') })
      );

      await expect(
        service.exchangeToken('ott-token', 'WrongPass1!')
      ).rejects.toMatchObject({ statusCode: 401 });
      expect(connectedAccountService.create).not.toHaveBeenCalled();
    });

    test('links the account once the correct password confirms the flagged token', async () => {
      securityStore.useOneTimeToken.mockResolvedValue({
        authUserId: 1,
        authSource: AuthSource.OAuth2Google,
        providerAccountId: '42',
        passwordRequired: true
      });
      authUserService.find.mockResolvedValue(
        user({ passwordHash: await hashPassword('Str0ng!Pass') })
      );

      const tokens = await service.exchangeToken('ott-token', 'Str0ng!Pass');

      expect(tokens.accessToken).toBe('token-1');
      expect(connectedAccountService.create).toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    test('rejects an invalid current password', async () => {
      const passwordHash = await hashPassword('Str0ng!Pass');

      await expect(
        service.changePassword(user({ passwordHash }), 'wrong', 'New!Pass123')
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('current password invalid')
      });
    });

    test('rejects a new password that fails the complexity rules', async () => {
      const passwordHash = await hashPassword('Str0ng!Pass');

      await expect(
        service.changePassword(user({ passwordHash }), 'Str0ng!Pass', 'weak')
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    test('updates the password hash and returns new tokens', async () => {
      const passwordHash = await hashPassword('Str0ng!Pass');
      const authUser = user({ passwordHash });
      authUserService.query.mockImplementation(async () => ({
        items: [{ ...authUser, passwordHash: authUserService.updatedHash }]
      }));
      authUserService.update.mockImplementation(
        async (_id: number, data: any) => {
          authUserService.updatedHash = data.passwordHash;
          return { ...authUser, ...data };
        }
      );

      const tokens = await service.changePassword(
        authUser,
        'Str0ng!Pass',
        'New!Pass123'
      );

      expect(authUserService.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          passwordHash: expect.any(String),
          logoutAt: expect.any(Date)
        })
      );
      expect(tokens.accessToken).toBeDefined();
    });
  });

  describe('logout', () => {
    test('sets the logout timestamp and clears the cached user', async () => {
      await expect(service.logout(1)).resolves.toBe(true);

      expect(cacheService.removeCachedValue).toHaveBeenCalledWith('auth:1');
      expect(authUserService.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ logoutAt: expect.any(Date) })
      );
    });
  });

  describe('registerAuthUser', () => {
    test('creates the user from the configured registration data', async () => {
      authUserService[CONFIG] = {
        registrationData: (source: AuthSource, email: string) => ({
          email,
          source
        })
      };
      authUserService.create.mockImplementation(async (data: any) => ({
        id: 2,
        ...data
      }));

      const created = await service.registerAuthUser(
        AuthSource.Password,
        'new@test.com'
      );

      expect(authUserService.create).toHaveBeenCalledWith({
        email: 'new@test.com',
        source: AuthSource.Password,
        verifiedEmail: false
      });
      expect(created).toMatchObject({ id: 2 });
    });

    test('marks the email as verified for external sources', async () => {
      authUserService[CONFIG] = {
        registrationData: (_source: AuthSource, email: string) => ({ email })
      };
      authUserService.create.mockResolvedValue({ id: 2 });

      await service.registerAuthUser(AuthSource.OAuth2Google, 'new@test.com');

      expect(authUserService.create).toHaveBeenCalledWith(
        expect.objectContaining({ verifiedEmail: true })
      );
    });

    test('wraps a registration failure into a server error', async () => {
      authUserService[CONFIG] = {
        registrationData: () => {
          throw new Error('invalid data');
        }
      };

      await expect(
        service.registerAuthUser(AuthSource.Password, 'new@test.com')
      ).rejects.toMatchObject({ statusCode: 500 });
    });

    test('saves the selected registration files once the user exists', async () => {
      const avatarFile = {
        name: 'avatar.png',
        mimeType: 'image/png',
        size: 3,
        data: Buffer.from('png')
      };

      authUserService[CONFIG] = {
        registrationData: (_source: AuthSource, email: string) => ({ email }),
        registrationFiles: (_source: AuthSource, data: any) => ({
          avatar: data?.avatarFile,
          banner: undefined
        })
      };
      authUserService.create.mockResolvedValue({ id: 2 });

      await service.registerAuthUser(
        AuthSource.OAuth2Google,
        'new@test.com',
        undefined,
        { avatarFile }
      );

      expect(fileService.saveBuffer).toHaveBeenCalledTimes(1);
      expect(fileService.saveBuffer).toHaveBeenCalledWith(
        'avatar',
        avatarFile,
        { id: 2 },
        authUserService.client
      );
    });

    test('registers the user without files when none are configured', async () => {
      authUserService[CONFIG] = {
        registrationData: (_source: AuthSource, email: string) => ({ email })
      };
      authUserService.create.mockResolvedValue({ id: 2 });

      await service.registerAuthUser(AuthSource.Password, 'new@test.com');

      expect(fileService.saveBuffer).not.toHaveBeenCalled();
    });

    test('completes the registration when a file cannot be saved', async () => {
      authUserService[CONFIG] = {
        registrationData: (_source: AuthSource, email: string) => ({ email }),
        registrationFiles: () => ({
          avatar: {
            name: 'avatar.png',
            mimeType: 'image/png',
            data: Buffer.from('png')
          }
        })
      };
      authUserService.create.mockResolvedValue({ id: 2 });
      fileService.saveBuffer.mockRejectedValue(new Error('unsupported type'));

      await expect(
        service.registerAuthUser(AuthSource.OAuth2Google, 'new@test.com')
      ).resolves.toMatchObject({ id: 2 });
    });
  });

  describe('updateAuthUser', () => {
    test('updates the user through the auth user service', async () => {
      await service.updateAuthUser(1, { email: 'new@test.com' });

      expect(authUserService.update).toHaveBeenCalledWith(1, {
        email: 'new@test.com'
      });
    });

    test('wraps an update failure into a server error', async () => {
      authUserService.update.mockRejectedValue(new Error('db down'));

      await expect(service.updateAuthUser(1, {})).rejects.toMatchObject({
        statusCode: 500,
        message: expect.stringContaining('update error')
      });
    });
  });
});
