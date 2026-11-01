import { AsyncResource } from 'node:async_hooks';
import Fastify from 'fastify';
import { fastifyRequestContext } from '@fastify/request-context';
import { AuthSource } from '@appweaver/common';
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
        method: 'sms',
        destination: '+385*******67',
        methods: ['sms']
      }),
      verifyChallenge: jest
        .fn()
        .mockResolvedValue({ token: 'ott', expiresIn: 120000 }),
      listMethods: jest
        .fn()
        .mockReturnValue({ enabled: ['totp'], available: ['email', 'totp'] }),
      availableMethods: jest.fn().mockReturnValue(['email', 'totp']),
      enableMethod: jest.fn().mockResolvedValue(['totp', 'email']),
      orderMethods: jest.fn().mockResolvedValue(['email', 'totp']),
      disableMethod: jest.fn().mockResolvedValue([]),
      setupTotp: jest.fn().mockResolvedValue({
        secret: 'JBSWY3DPEHPK3PXP',
        otpauthUrl: 'otpauth://totp/App:user?secret=JBSWY3DPEHPK3PXP',
        expiresIn: 600000
      }),
      confirmTotp: jest.fn().mockResolvedValue(['totp']),
      generateRecoveryCodes: jest.fn().mockResolvedValue({
        codes: ['7G2K-QX9M-4TZB-8HRW'],
        generatedAt: new Date('2026-11-01T12:00:00.000Z')
      })
    };
    define(service as any, TwoFactorService, 'override');

    server = Fastify({ logger: false, ...requestValidation() });
    server.setErrorHandler(errorHandler);
    server.register(fastifyRequestContext, {
      createAsyncResource: () =>
        runInAuthContext(() => new AsyncResource('appweaver-request'))
    });
    // Signs the user in with OAuth2, so the challenge keeps the source
    server.decorate('authenticate', () => async () => {
      setAuthContext({
        authUser: user,
        authSource: AuthSource.OAuth2Google
      });
    });
    server.decorate('currentUser', () => user as any);
    server.register(schemas);
    server.register(twoFactorRoutes);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  const inject = (method: string, url: string, payload?: object) =>
    server.inject({ method: method as any, url, payload });

  test('sends a challenge with the source of the sign-in', async () => {
    const response = await inject('POST', '/challenge', { method: 'sms' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      challengeId: 'challenge',
      method: 'sms'
    });
    expect(service.sendChallenge).toHaveBeenCalledWith(user, {
      method: 'sms',
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
      enabled: ['totp'],
      available: ['email', 'totp']
    });
  });

  test('enables a method', async () => {
    const response = await inject('POST', '/methods', { method: 'email' });

    expect(response.json()).toEqual({
      enabled: ['totp', 'email'],
      available: ['email', 'totp']
    });
    expect(service.enableMethod).toHaveBeenCalledWith(user, 'email');
  });

  test('rejects enabling the TOTP method without its setup', async () => {
    const response = await inject('POST', '/methods', { method: 'totp' });

    expect(response.statusCode).toBe(400);
  });

  test('orders the methods', async () => {
    const response = await inject('PUT', '/methods/order', {
      methods: ['email', 'totp']
    });

    expect(response.json().enabled).toEqual(['email', 'totp']);
    expect(service.orderMethods).toHaveBeenCalledWith(user, ['email', 'totp']);
  });

  test('disables a method with the password', async () => {
    const response = await inject('DELETE', '/methods/totp', {
      password: 'secret'
    });

    expect(response.json().enabled).toEqual([]);
    expect(service.disableMethod).toHaveBeenCalledWith(user, 'totp', 'secret');
  });

  test('starts and confirms a TOTP setup', async () => {
    const setup = await inject('POST', '/totp/setup');
    const confirm = await inject('POST', '/totp/confirm', { code: '123456' });

    expect(setup.json()).toMatchObject({ secret: 'JBSWY3DPEHPK3PXP' });
    expect(confirm.json().enabled).toEqual(['totp']);
    expect(service.confirmTotp).toHaveBeenCalledWith(user, '123456');
  });

  test('sends a challenge for a recovery code', async () => {
    const response = await inject('POST', '/challenge', { method: 'recovery' });

    expect(response.statusCode).toBe(200);
    expect(service.sendChallenge).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ method: 'recovery' })
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
