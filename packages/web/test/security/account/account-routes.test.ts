import Fastify from 'fastify';
import { define } from '@appweaver/core';
import { errorHandler } from '../../../errors/error-handler';
import { accountRoutes } from '../../../security/account';
import { AccountService } from '../../../security/account/account-service';
import { requestValidation } from '../../../server/request-validation';
import schemas from '../../../server/schemas';
import { Server } from '../../../types/server';

describe('account-routes', () => {
  let server: Server;
  let actions: Record<string, unknown>[];

  beforeEach(async () => {
    define(
      {
        sendResetPassword: jest.fn().mockResolvedValue('Sent'),
        resetPassword: jest.fn().mockResolvedValue('Reset')
      } as any,
      AccountService,
      'override'
    );

    actions = [];
    server = Fastify({
      logger: false,
      ...requestValidation()
    });
    server.setErrorHandler(errorHandler);
    server.decorate('authenticate', () => async () => undefined);
    server.decorate('currentUser', () => ({ id: 1 }) as any);
    // Records the actions each bot check receives from the route config
    server.decorate('recaptcha', async (request: any) => {
      actions.push({ recaptcha: request.routeOptions.config.recaptchaAction });
    });
    server.decorate('turnstile', async (request: any) => {
      actions.push({ turnstile: request.routeOptions.config.turnstileAction });
    });
    server.register(schemas);
    server.register(accountRoutes);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  describe('accountRoutes', () => {
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
