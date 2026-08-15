import {
  AuthSource,
  AuthUser,
  CONFIG,
  RESOURCE_AUTH,
  RESOURCE_MODEL_TYPE,
  RESOURCE_NAME,
  RESOURCE_SERVICE_TYPE,
  RESOURCE_TYPE
} from '@appweaver/common';
import { context, define } from '../../../context';
import { HttpError } from '../../../errors';
import { OAuth2Service } from '../../../security/oauth2/oauth2-service';
import { resetContext } from '../../fixtures/context-fixture';

describe('oauth2-service', () => {
  let authUserService: any;
  let connectedAccountService: any;
  let service: OAuth2Service;

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
      find: jest.fn(),
      query: jest.fn().mockResolvedValue({ items: [] }),
      create: jest.fn(),
      update: jest.fn(),
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

    service = new OAuth2Service();
  });

  /**
   * The connected account resource service is resolved once when the service is constructed, so removing it from the
   * context only takes effect for an instance built afterwards.
   */
  const serviceWithoutConnectedAccounts = (): OAuth2Service => {
    context.resource.services.delete('ConnectedAccount');
    return new OAuth2Service();
  };

  afterAll(() => {
    resetContext();
  });

  describe('checkUser', () => {
    const userInfo = { email: 'new@test.com' } as any;

    test('passes when no callback is configured', async () => {
      await expect(
        service.checkUser(AuthSource.OAuth2Google, userInfo, null)
      ).resolves.toBeUndefined();
    });

    test('passes when the callback returns nothing', async () => {
      authUserService[CONFIG] = { checkOAuth2User: () => undefined };

      await expect(
        service.checkUser(AuthSource.OAuth2Google, userInfo, null)
      ).resolves.toBeUndefined();
    });

    test('rejects with a forbidden error for a returned message', async () => {
      authUserService[CONFIG] = {
        checkOAuth2User: () => 'Domain is not allowed'
      };

      await expect(
        service.checkUser(AuthSource.OAuth2Google, userInfo, null)
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('Domain is not allowed')
      });
    });

    test('rethrows a returned HttpError as is', async () => {
      const error = new HttpError('Blocked', 409);
      authUserService[CONFIG] = { checkOAuth2User: () => error };

      await expect(
        service.checkUser(AuthSource.OAuth2Google, userInfo, null)
      ).rejects.toBe(error);
    });
  });

  describe('requiresPasswordConfirmation', () => {
    test('is skipped for a user without a password', async () => {
      await expect(
        service.requiresPasswordConfirmation(
          user(),
          AuthSource.OAuth2Google,
          '42'
        )
      ).resolves.toBe(false);
    });

    test('is required the first time a provider account is seen', async () => {
      await expect(
        service.requiresPasswordConfirmation(
          user({ passwordHash: 'hash' }),
          AuthSource.OAuth2Google,
          '42'
        )
      ).resolves.toBe(true);
    });

    test('is skipped once the provider account is already linked', async () => {
      connectedAccountService.query.mockResolvedValue({
        items: [{ id: 3, userId: 1 }]
      });

      await expect(
        service.requiresPasswordConfirmation(
          user({ passwordHash: 'hash' }),
          AuthSource.OAuth2Google,
          '42'
        )
      ).resolves.toBe(false);
    });

    test('is required when there is no link table to remember a confirmation', async () => {
      await expect(
        serviceWithoutConnectedAccounts().requiresPasswordConfirmation(
          user({ passwordHash: 'hash' }),
          AuthSource.OAuth2Google,
          '42'
        )
      ).resolves.toBe(true);
    });

    test('is required when the provider account belongs to a different user', async () => {
      connectedAccountService.query.mockResolvedValue({
        items: [{ id: 3, userId: 99 }]
      });

      await expect(
        service.requiresPasswordConfirmation(
          user({ passwordHash: 'hash' }),
          AuthSource.OAuth2Google,
          '42'
        )
      ).resolves.toBe(true);
    });
  });

  describe('findConnectedAccount', () => {
    test('returns null when connected accounts are not tracked', async () => {
      await expect(
        serviceWithoutConnectedAccounts().findConnectedAccount(
          AuthSource.OAuth2Google,
          '42'
        )
      ).resolves.toBeNull();
    });

    test('queries the resource service by provider and account id', async () => {
      connectedAccountService.query.mockResolvedValue({ items: [{ id: 3 }] });

      await expect(
        service.findConnectedAccount(AuthSource.OAuth2Google, '42')
      ).resolves.toEqual({ id: 3 });
      expect(connectedAccountService.query).toHaveBeenCalledWith({
        provider: AuthSource.OAuth2Google,
        providerAccountId: '42'
      });
    });

    test('wraps a lookup failure into a server error', async () => {
      connectedAccountService.query.mockRejectedValue(new Error('db down'));

      await expect(
        service.findConnectedAccount(AuthSource.OAuth2Google, '42')
      ).rejects.toBeInstanceOf(HttpError);
    });
  });

  describe('linkConnectedAccount', () => {
    test('does nothing when connected accounts are not tracked', async () => {
      await expect(
        serviceWithoutConnectedAccounts().linkConnectedAccount(
          user(),
          AuthSource.OAuth2Google,
          '42'
        )
      ).resolves.toBeUndefined();
      expect(connectedAccountService.create).not.toHaveBeenCalled();
    });

    test('creates the link on the first sign-in', async () => {
      await service.linkConnectedAccount(
        user(),
        AuthSource.OAuth2Google,
        '42',
        'profile email'
      );

      expect(connectedAccountService.create).toHaveBeenCalledWith({
        provider: AuthSource.OAuth2Google,
        providerAccountId: '42',
        scope: 'profile email',
        lastLoginAt: expect.any(Date),
        user: { id: 1 }
      });
    });

    test('refreshes an existing link instead of duplicating it', async () => {
      connectedAccountService.query.mockResolvedValue({
        items: [{ id: 3, userId: 1 }]
      });

      await service.linkConnectedAccount(
        user(),
        AuthSource.OAuth2Google,
        '42',
        'profile'
      );

      expect(connectedAccountService.create).not.toHaveBeenCalled();
      expect(connectedAccountService.update).toHaveBeenCalledWith(3, {
        scope: 'profile',
        lastLoginAt: expect.any(Date)
      });
    });

    test('refuses to move a provider account to another user', async () => {
      connectedAccountService.query.mockResolvedValue({
        items: [{ id: 3, userId: 99 }]
      });

      await expect(
        service.linkConnectedAccount(user(), AuthSource.OAuth2Google, '42')
      ).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('already linked to another user')
      });
      expect(connectedAccountService.create).not.toHaveBeenCalled();
      expect(connectedAccountService.update).not.toHaveBeenCalled();
    });
  });
});
