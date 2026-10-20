jest.mock('@appweaver/common', () => {
  const actual = jest.requireActual('@appweaver/common');
  Object.assign(actual.configOverrides, {
    SECURITY_TURNSTILE_SECRET: 'turnstile-secret'
  });
  return actual;
});

import { config, ErrorCode } from '@appweaver/common';
import { turnstileConfig } from '../../../security/security-config';
import { turnstileVerify } from '../../../security/turnstile/turnstile-verify';
import { jsonResponse } from '../../fixtures/oauth2-fixture';

describe('turnstile-verify', () => {
  let fetchMock: jest.SpyInstance;

  const verifyResponse = (body: Record<string, unknown>, status = 200) =>
    fetchMock.mockResolvedValue(jsonResponse(body, status));

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('turnstileVerify', () => {
    test('posts the secret, token, and client IP to the verify URL', async () => {
      verifyResponse({ success: true, action: 'login' });

      await turnstileVerify('token-value', '10.0.0.1', 'login');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(turnstileConfig.VERIFY_URL);
      expect(url).toBe(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify'
      );
      expect(init.method).toBe('POST');
      expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({
        secret: 'turnstile-secret',
        response: 'token-value',
        remoteip: '10.0.0.1'
      });
    });

    test('leaves out a missing client IP', async () => {
      verifyResponse({ success: true, action: 'login' });

      await turnstileVerify('token-value');

      const params = new URLSearchParams(fetchMock.mock.calls[0][1].body);
      expect(params.has('remoteip')).toBe(false);
    });

    test('accepts any action when none is expected', async () => {
      verifyResponse({ success: true, action: 'signup' });

      await expect(turnstileVerify('token-value')).resolves.toBeUndefined();
    });

    test('accepts a token without an action when none is expected', async () => {
      verifyResponse({ success: true });

      await expect(turnstileVerify('token-value')).resolves.toBeUndefined();
    });

    test('rejects an invalid token with the Cloudflare error codes', async () => {
      verifyResponse({
        success: false,
        'error-codes': ['timeout-or-duplicate']
      });

      await expect(turnstileVerify('token-value')).rejects.toMatchObject({
        code: ErrorCode.TurnstileInvalid,
        message: 'Turnstile invalid token',
        details: { errorCodes: ['timeout-or-duplicate'] }
      });
    });

    test('rejects an invalid token without error codes', async () => {
      verifyResponse({ success: false });

      await expect(turnstileVerify('token-value')).rejects.toMatchObject({
        code: ErrorCode.TurnstileInvalid,
        details: { errorCodes: [] }
      });
    });

    test.each([
      'invalid-input-secret',
      'missing-input-secret',
      'internal-error'
    ])(
      'reports the verification unavailable on the %s error',
      async (errorCode) => {
        verifyResponse({ success: false, 'error-codes': [errorCode] });

        await expect(turnstileVerify('token-value')).rejects.toMatchObject({
          code: ErrorCode.TurnstileUnavailable
        });
      }
    );

    test('rejects a token issued for another action', async () => {
      verifyResponse({ success: true, action: 'signup' });

      await expect(
        turnstileVerify('token-value', undefined, 'login')
      ).rejects.toMatchObject({ code: ErrorCode.TurnstileActionMismatch });
    });

    test('fails when the verification request fails', async () => {
      verifyResponse({}, 503);

      await expect(turnstileVerify('token-value')).rejects.toMatchObject({
        code: ErrorCode.TurnstileUnavailable
      });
    });

    test('fails when the verify URL cannot be reached', async () => {
      const cause = new TypeError('fetch failed');
      fetchMock.mockRejectedValue(cause);

      await expect(turnstileVerify('token-value')).rejects.toMatchObject({
        code: ErrorCode.TurnstileUnavailable,
        cause
      });
    });

    test('fails when the verification response is not JSON', async () => {
      fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>'));

      await expect(turnstileVerify('token-value')).rejects.toMatchObject({
        code: ErrorCode.TurnstileUnavailable
      });
    });
  });
});
