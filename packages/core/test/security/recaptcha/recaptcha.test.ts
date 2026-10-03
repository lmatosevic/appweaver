jest.mock('@appweaver/common', () => {
  const actual = jest.requireActual('@appweaver/common');
  const configOverrides: Record<string, unknown> = {
    SECURITY_RECAPTCHA_SECRET: 'recaptcha-secret'
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

jest.mock('../../../security/recaptcha/recaptcha-verify', () => ({
  recaptchaVerify: jest.fn().mockResolvedValue(undefined)
}));

import * as common from '@appweaver/common';
import { recaptcha } from '../../../security/recaptcha/recaptcha';
import { recaptchaVerify } from '../../../security/recaptcha/recaptcha-verify';
import { Server } from '../../../types';
import { createTestServer } from '../../fixtures/server-fixture';

const configOverrides: Record<string, unknown> = (common as any)
  .configOverrides;

describe('recaptcha', () => {
  let server: Server;

  async function startServer() {
    server = createTestServer();
    server.register(recaptcha);
    server.after(() => {
      server.post('/login', {
        config: { recaptchaAction: 'login' },
        onRequest: server.recaptcha,
        handler: async () => ({ ok: true })
      });
    });
    await server.ready();
  }

  afterEach(async () => {
    await server?.close();
    (recaptchaVerify as jest.Mock).mockClear();
    delete configOverrides.SECURITY_RECAPTCHA_HEADER_NAME;
    configOverrides.SECURITY_RECAPTCHA_SECRET = 'recaptcha-secret';
  });

  describe('recaptcha', () => {
    test('verifies the token with the client IP and the route action', async () => {
      await startServer();

      const response = await server.inject({
        method: 'POST',
        url: '/login',
        headers: { 'x-recaptcha-token': '  token-value ' },
        remoteAddress: '10.0.0.1'
      });

      expect(response.statusCode).toBe(200);
      expect(recaptchaVerify).toHaveBeenCalledWith(
        'token-value',
        '10.0.0.1',
        'login'
      );
    });

    test('reads the token from the configured header', async () => {
      configOverrides.SECURITY_RECAPTCHA_HEADER_NAME = 'X-Captcha';
      await startServer();

      const response = await server.inject({
        method: 'POST',
        url: '/login',
        headers: { 'x-captcha': 'token-value' }
      });

      expect(response.statusCode).toBe(200);
    });

    test('rejects a request without the token header', async () => {
      await startServer();

      const response = await server.inject({ method: 'POST', url: '/login' });

      expect(response.statusCode).toBe(401);
      expect(recaptchaVerify).not.toHaveBeenCalled();
    });

    test('rejects the request the verification rejects', async () => {
      await startServer();
      const { HttpError } = jest.requireActual('../../../errors');
      (recaptchaVerify as jest.Mock).mockRejectedValueOnce(
        new HttpError('reCAPTCHA low score', 403)
      );

      const response = await server.inject({
        method: 'POST',
        url: '/login',
        headers: { 'x-recaptcha-token': 'token-value' }
      });

      expect(response.statusCode).toBe(403);
    });

    test('fails to start without the secret', async () => {
      configOverrides.SECURITY_RECAPTCHA_SECRET = undefined;

      await expect(startServer()).rejects.toThrow(
        'reCAPTCHA secret is not set'
      );
    });
  });
});
