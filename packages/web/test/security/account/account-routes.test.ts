import Fastify from 'fastify';
import { define, EmailService, SmsService } from '@appweaver/core';
import { context } from '@appweaver/core/internal';
import { errorHandler } from '../../../errors/error-handler';
import { accountRoutes } from '../../../security/account';
import { AccountService } from '../../../security/account/account-service';
import { requestValidation } from '../../../server/request-validation';
import schemas from '../../../server/schemas';
import { Server } from '../../../types/server';

describe('account-routes', () => {
  let server: Server;
  let actions: Record<string, unknown>[];

  /** Creates the server of the account routes, with the services sending their messages unless left out. */
  const createServer = async (
    services: { email?: boolean; sms?: boolean } = {}
  ): Promise<Server> => {
    for (const [service, defined] of [
      [EmailService, services.email !== false],
      [SmsService, services.sms !== false]
    ] as const) {
      const index = context.definitions.findIndex(
        (definition) => definition.name === service.name
      );
      if (index > -1) {
        context.definitions.splice(index, 1);
      }
      if (defined) {
        define({} as any, service as any, 'override');
      }
    }
    define(
      {
        sendResetPassword: jest.fn().mockResolvedValue('Sent'),
        resetPassword: jest.fn().mockResolvedValue('Reset'),
        sendPhoneVerification: jest
          .fn()
          .mockResolvedValue({ challengeId: 'challenge', expiresIn: 600000 }),
        verifyPhone: jest.fn().mockResolvedValue('Phone number verified')
      } as any,
      AccountService,
      'override'
    );

    actions = [];
    const created = Fastify({
      logger: false,
      ...requestValidation()
    }) as unknown as Server;
    created.setErrorHandler(errorHandler);
    created.decorate('authenticate', () => async () => undefined);
    created.decorate('currentUser', () => ({ id: 1 }) as any);
    // Records the actions each bot check receives from the route config
    created.decorate('recaptcha', async (request: any) => {
      actions.push({ recaptcha: request.routeOptions.config.recaptchaAction });
    });
    created.decorate('turnstile', async (request: any) => {
      actions.push({ turnstile: request.routeOptions.config.turnstileAction });
    });
    created.register(schemas);
    created.register(accountRoutes);
    await created.ready();
    return created;
  };

  beforeEach(async () => {
    server = await createServer();
  });

  afterEach(async () => {
    await server.close();
  });

  describe('accountRoutes', () => {
    test('leaves out the email routes without a mailer', async () => {
      await server.close();
      server = await createServer({ email: false });

      for (const url of [
        '/send-verify-email',
        '/verify-email',
        '/send-reset-password',
        '/reset-password'
      ]) {
        expect(server.hasRoute({ method: 'POST', url })).toBe(false);
      }
      expect(server.hasRoute({ method: 'POST', url: '/verify-phone' })).toBe(
        true
      );
    });

    test('leaves out the phone routes without an SMS sender', async () => {
      await server.close();
      server = await createServer({ sms: false });

      for (const url of ['/send-verify-phone', '/verify-phone']) {
        expect(server.hasRoute({ method: 'POST', url })).toBe(false);
      }
      expect(
        server.hasRoute({ method: 'POST', url: '/send-reset-password' })
      ).toBe(true);
    });

    test('sends a phone verification code', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/send-verify-phone',
        payload: { phoneNumber: '+385911234567' }
      });

      expect(response.json()).toEqual({
        challengeId: 'challenge',
        expiresIn: 600000
      });
    });

    test('rejects a phone number outside the E.164 format', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/send-verify-phone',
        payload: { phoneNumber: '091 123 4567' }
      });

      expect(response.statusCode).toBe(400);
    });

    test('verifies a phone number', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/verify-phone',
        payload: { challengeId: 'challenge', code: '123456' }
      });

      expect(response.json()).toEqual({ message: 'Phone number verified' });
    });

    test('verifies the bot checks of the send reset password action', async () => {
      await server.inject({
        method: 'POST',
        url: '/send-reset-password',
        payload: {
          email: 'user@example.com',
          redirectToUrl: 'https://example.com/reset'
        }
      });

      expect(actions).toEqual([
        { recaptcha: 'send-reset-password' },
        { turnstile: 'send-reset-password' }
      ]);
    });

    test('verifies the bot checks of the reset password action', async () => {
      await server.inject({
        method: 'POST',
        url: '/reset-password',
        payload: { token: 'token', newPassword: 'N3w!Password' }
      });

      expect(actions).toEqual([
        { recaptcha: 'reset-password' },
        { turnstile: 'reset-password' }
      ]);
    });
  });
});
