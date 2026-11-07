import { AsyncResource } from 'node:async_hooks';
import Fastify from 'fastify';
import { fastifyRequestContext } from '@fastify/request-context';
import { AuthSource, configOverrides } from '@appweaver/common';
import { define, runInAuthContext, setAuthContext } from '@appweaver/core';
import { errorHandler } from '../../../errors/error-handler';
import { twoFactorRoutes } from '../../../security/two-factor';
import { TwoFactorService } from '../../../security/two-factor/two-factor-service';
import { requestValidation } from '../../../server/request-validation';
import schemas from '../../../server/schemas';
import { Server } from '../../../types/server';

describe('two-factor-routes', () => {
  const user = { id: 1, email: 'user@test.com', roles: [] };
  let service: Record<string, jest.Mock>;
  let server: Server;

  beforeEach(async () => {
    service = {
      sendChallenge: jest.fn().mockResolvedValue({
        challengeId: 'challenge',
        expiresIn: 300000,
        method: 'Sms',
        destination: '+385*******67',
        methods: ['Sms']
      }),
      verifyChallenge: jest
        .fn()
        .mockResolvedValue({ token: 'ott', expiresIn: 120000 }),
      listMethods: jest
        .fn()
        .mockReturnValue({ enabled: ['Totp'], available: ['Email', 'Totp'] }),
      availableMethods: jest.fn().mockReturnValue(['Email', 'Totp']),
      enableMethod: jest.fn().mockResolvedValue(['Totp', 'Email']),
      orderMethods: jest.fn().mockResolvedValue(['Email', 'Totp']),
      disableMethod: jest.fn().mockResolvedValue([]),
      setupTotp: jest.fn().mockResolvedValue({
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUrl: 'otpauth://totp/App:user?secret=JBSWY3DPEHPK3PXP',
        expiresIn: 600000
      }),
      confirmTotp: jest.fn().mockResolvedValue(['Totp']),
      generateRecoveryCodes: jest.fn().mockResolvedValue({
        codes: ['7G2K-QX9M-4TZB-8HRW'],
        generatedAt: new Date('2026-11-01T12:00:00.000Z')
      })
    };
    define(service as any, TwoFactorService, 'override');

    server = await createServer();
  });

  afterEach(async () => {
    await server.close();
    delete configOverrides.SECURITY_ACCOUNT_2FA_RECOVERY_CODES_ENABLED;
  });

  const createServer = async (): Promise<Server> => {
    const created = Fastify({
      logger: false,
      ...requestValidation()
    }) as unknown as Server;
    created.setErrorHandler(errorHandler);
    created.register(fastifyRequestContext, {
      createAsyncResource: () =>
        runInAuthContext(() => new AsyncResource('appweaver-request'))
    });
    // Signs the user in with OAuth2, so the challenge keeps the source
    created.decorate('authenticate', () => async () => {
      setAuthContext({
        authUser: user,
        authSource: AuthSource.OAuth2Google
      });
    });
    created.decorate('currentUser', () => user as any);
    created.register(schemas);
    created.register(twoFactorRoutes);
    await created.ready();
    return created;
  };

  test('leaves out the TOTP setup without the TOTP method', async () => {
    await server.close();
    service.availableMethods.mockReturnValue(['Email', 'Sms']);
    server = await createServer();

    for (const url of ['/totp/setup', '/totp/confirm']) {
      expect(server.hasRoute({ method: 'POST', url })).toBe(false);
    }
    expect(server.hasRoute({ method: 'POST', url: '/challenge' })).toBe(true);
  });

  test('leaves out the recovery codes while they are disabled', async () => {
    await server.close();
    configOverrides.SECURITY_ACCOUNT_2FA_RECOVERY_CODES_ENABLED = false;
    server = await createServer();

    expect(server.hasRoute({ method: 'POST', url: '/recovery-codes' })).toBe(
      false
    );
    expect(server.hasRoute({ method: 'POST', url: '/totp/setup' })).toBe(true);
  });

  const inject = (method: string, url: string, payload?: object) =>
    server.inject({ method: method as any, url, payload });

  test('sends a challenge with the source of the sign-in', async () => {
    const response = await inject('POST', '/challenge', { method: 'Sms' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      challengeId: 'challenge',
      method: 'Sms'
    });
    expect(service.sendChallenge).toHaveBeenCalledWith(user, {
      method: 'Sms',
      purpose: undefined,
      authSource: AuthSource.OAuth2Google
    });
  });

  test('rejects an unknown method', async () => {
    const response = await inject('POST', '/challenge', { method: 'pigeon' });

    expect(response.statusCode).toBe(400);
    expect(service.sendChallenge).not.toHaveBeenCalled();
  });

  test('verifies a challenge', async () => {
    const response = await inject('POST', '/verify', {
      challengeId: 'challenge',
      code: '123456'
    });

    expect(response.json()).toEqual({ token: 'ott', expiresIn: 120000 });
    expect(service.verifyChallenge).toHaveBeenCalledWith(
      user,
      'challenge',
      '123456'
    );
  });

  test('lists the methods', async () => {
    const response = await inject('GET', '/methods');

    expect(response.json()).toEqual({
      enabled: ['Totp'],
      available: ['Email', 'Totp']
    });
  });

  test('enables a method', async () => {
    const response = await inject('POST', '/methods', { method: 'Email' });

    expect(response.json()).toEqual({
      enabled: ['Totp', 'Email'],
      available: ['Email', 'Totp']
    });
    expect(service.enableMethod).toHaveBeenCalledWith(user, 'Email');
  });

  test('rejects enabling the TOTP method without its setup', async () => {
    const response = await inject('POST', '/methods', { method: 'Totp' });

    expect(response.statusCode).toBe(400);
  });

  test('orders the methods', async () => {
    const response = await inject('PUT', '/methods/order', {
      methods: ['Email', 'Totp']
    });

    expect(response.json().enabled).toEqual(['Email', 'Totp']);
    expect(service.orderMethods).toHaveBeenCalledWith(user, ['Email', 'Totp']);
  });

  test('disables a method with the password', async () => {
    const response = await inject('DELETE', '/methods/Totp', {
      password: 'secret'
    });

    expect(response.json().enabled).toEqual([]);
    expect(service.disableMethod).toHaveBeenCalledWith(user, 'Totp', 'secret');
  });

  test('starts and confirms a TOTP setup', async () => {
    const setup = await inject('POST', '/totp/setup');
    const confirm = await inject('POST', '/totp/confirm', { code: '123456' });

    expect(setup.json()).toMatchObject({ secret: 'JBSWY3DPEHPK3PXP' });
    expect(confirm.json().enabled).toEqual(['Totp']);
    expect(service.confirmTotp).toHaveBeenCalledWith(user, '123456');
  });

  test('sends a challenge for a recovery code', async () => {
    const response = await inject('POST', '/challenge', { method: 'Recovery' });

    expect(response.statusCode).toBe(200);
    expect(service.sendChallenge).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ method: 'Recovery' })
    );
  });

  test('generates the recovery codes with the password', async () => {
    const response = await inject('POST', '/recovery-codes', {
      password: 'secret'
    });

    expect(response.json()).toEqual({
      codes: ['7G2K-QX9M-4TZB-8HRW'],
      generatedAt: '2026-11-01T12:00:00.000Z'
    });
    expect(service.generateRecoveryCodes).toHaveBeenCalledWith(user, 'secret');
  });
});
