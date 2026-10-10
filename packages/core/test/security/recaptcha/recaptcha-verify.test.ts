jest.mock('@appweaver/common', () => {
  const actual = jest.requireActual('@appweaver/common');
  return {
    __esModule: true,
    ...actual,
    config: {
      ...actual.config,
      SECURITY_RECAPTCHA_SECRET: 'recaptcha-secret',
      SECURITY_RECAPTCHA_MIN_SCORE: 0.5
    }
  };
});

import { config, ErrorCode } from '@appweaver/common';
import { recaptchaVerify } from '../../../security/recaptcha/recaptcha-verify';
import { jsonResponse } from '../../fixtures/oauth2-fixture';

describe('recaptcha-verify', () => {
  let fetchMock: jest.SpyInstance;

  const verifyResponse = (body: Record<string, unknown>, status = 200) =>
    fetchMock.mockResolvedValue(jsonResponse(body, status));

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('recaptchaVerify', () => {
    test('posts the secret, token, and client IP to the verify URL', async () => {
      verifyResponse({ success: true, score: 0.9, action: 'login' });

      await recaptchaVerify('token-value', '10.0.0.1', 'login');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(config.SECURITY_RECAPTCHA_VERIFY_URL);
      expect(init.method).toBe('POST');
      expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({
        secret: 'recaptcha-secret',
        response: 'token-value',
        remoteip: '10.0.0.1'
      });
    });

    test('leaves out a missing client IP', async () => {
      verifyResponse({ success: true, score: 0.9, action: 'login' });

      await recaptchaVerify('token-value');

      const params = new URLSearchParams(fetchMock.mock.calls[0][1].body);
      expect(params.has('remoteip')).toBe(false);
    });

    test('accepts any action when none is expected', async () => {
      verifyResponse({ success: true, score: 0.9, action: 'signup' });

      await expect(recaptchaVerify('token-value')).resolves.toBeUndefined();
    });

    test('rejects an invalid token', async () => {
      verifyResponse({ success: false, score: 0, action: '' });

      await expect(recaptchaVerify('token-value')).rejects.toMatchObject({
        code: ErrorCode.RecaptchaInvalid,
        message: 'reCAPTCHA invalid token'
      });
    });

    test('rejects a token issued for another action', async () => {
      verifyResponse({ success: true, score: 0.9, action: 'signup' });

      await expect(
        recaptchaVerify('token-value', undefined, 'login')
      ).rejects.toMatchObject({ code: ErrorCode.RecaptchaActionMismatch });
    });

    test('rejects a score below the configured minimum', async () => {
      verifyResponse({ success: true, score: 0.4, action: 'login' });

      await expect(recaptchaVerify('token-value')).rejects.toMatchObject({
        code: ErrorCode.RecaptchaLowScore,
        message: 'reCAPTCHA low score'
      });
    });

    test('accepts the minimum score', async () => {
      verifyResponse({ success: true, score: 0.5, action: 'login' });

      await expect(recaptchaVerify('token-value')).resolves.toBeUndefined();
    });

    test('fails when the verification request fails', async () => {
      verifyResponse({}, 503);

      await expect(recaptchaVerify('token-value')).rejects.toMatchObject({
        code: ErrorCode.RecaptchaUnavailable
      });
    });
  });
});
