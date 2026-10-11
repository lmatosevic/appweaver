jest.mock('@appweaver/common', () => {
  const actual = jest.requireActual('@appweaver/common');
  const configOverrides: Record<string, unknown> = {
    SECURITY_TURNSTILE_SECRET: 'turnstile-secret'
  };
  return {
    __esModule: true,
    ...actual,
    configOverrides,
    get config() {
      return { ...actual.config, ...configOverrides };
    }
  };
});

jest.mock('../../../security/turnstile/turnstile-verify', () => ({
  turnstileVerify: jest.fn().mockResolvedValue(undefined)
}));

import * as common from '@appweaver/common';
import { turnstile } from '../../../security/turnstile/turnstile';
import { turnstileVerify } from '../../../security/turnstile/turnstile-verify';
import { Server } from '../../../types';
import { createTestServer } from '../../fixtures/server-fixture';

const configOverrides: Record<string, unknown> = (common as any)
  .configOverrides;

describe('turnstile', () => {
  let server: Server;

  async function startServer() {
    server = createTestServer();
    server.register(turnstile);
    server.after(() => {
      server.post('/login', {
        config: { turnstileAction: 'login' },
        onRequest: server.turnstile,
        handler: async () => ({ ok: true })
      });
    });
    await server.ready();
  }

  afterEach(async () => {
    await server?.close();
    (turnstileVerify as jest.Mock).mockClear();
    delete configOverrides.SECURITY_TURNSTILE_HEADER_NAME;
    configOverrides.SECURITY_TURNSTILE_SECRET = 'turnstile-secret';
  });

  describe('turnstile', () => {
    test('verifies the token with the client IP and the route action', async () => {
      await startServer();

      const response = await server.inject({
        method: 'POST',
        url: '/login',
        headers: { 'x-turnstile-token': '  token-value ' },
        remoteAddress: '10.0.0.1'
      });

      expect(response.statusCode).toBe(200);
      expect(turnstileVerify).toHaveBeenCalledWith(
        'token-value',
        '10.0.0.1',
        'login'
      );
    });

    test('reads the token from the configured header', async () => {
      configOverrides.SECURITY_TURNSTILE_HEADER_NAME = 'CF-Turnstile';
      await startServer();

      const response = await server.inject({
        method: 'POST',
        url: '/login',
        headers: { 'cf-turnstile': 'token-value' }
      });

      expect(response.statusCode).toBe(200);
    });

    test('rejects a request without the token header', async () => {
      await startServer();

      const response = await server.inject({ method: 'POST', url: '/login' });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: 'TURNSTILE_MISSING',
        details: { header: 'x-turnstile-token' }
      });
      expect(turnstileVerify).not.toHaveBeenCalled();
    });

    test('rejects the request the verification rejects', async () => {
      await startServer();
      const { TurnstileError } = jest.requireActual(
        '../../../security/turnstile/turnstile-error'
      );
      (turnstileVerify as jest.Mock).mockRejectedValueOnce(
        new TurnstileError('TURNSTILE_ACTION_MISMATCH', 'Turnstile mismatch')
      );

      const response = await server.inject({
        method: 'POST',
        url: '/login',
        headers: { 'x-turnstile-token': 'token-value' }
      });

      expect(response.statusCode).toBe(403);
    });

    test('fails to start without the secret', async () => {
      configOverrides.SECURITY_TURNSTILE_SECRET = undefined;

      await expect(startServer()).rejects.toThrow(
        'Turnstile secret is not set'
      );
    });
  });
});
