import * as common from '@appweaver/common';
import { AuthType, ErrorCode } from '@appweaver/common';
import { apiKeyConfig } from '@appweaver/data';
import {
  authErrorCodes,
  captchaErrorCodes,
  captchaHeaderSchema,
  recaptchaErrorCodes,
  turnstileErrorCodes,
  turnstileHeaderSchema
} from '../../security/auth-schema';

const configOverrides: Record<string, unknown> = (common as any)
  .configOverrides;

describe('auth-schema', () => {
  afterEach(() => {
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  describe('authErrorCodes', () => {
    test('returns no codes for a public route', () => {
      expect(authErrorCodes([])).toEqual([]);
    });

    test('returns the JWT codes for a JWT route', () => {
      const codes = authErrorCodes([AuthType.Jwt]);

      expect(codes).toEqual(
        expect.arrayContaining([
          ErrorCode.AuthUnauthorized,
          ErrorCode.AuthForbidden,
          ErrorCode.AuthInvalidToken,
          ErrorCode.AuthTokenExpired,
          ErrorCode.AuthScopeForbidden
        ])
      );
      expect(codes).not.toContain(ErrorCode.AuthApiKeyInvalid);
    });

    test('follows the enabled API key authentication', () => {
      const codes = authErrorCodes([AuthType.ApiKey]);

      expect(codes.includes(ErrorCode.AuthApiKeyInvalid)).toBe(
        apiKeyConfig.ENABLED
      );
    });
  });

  describe('recaptchaErrorCodes', () => {
    test('returns no codes for a route without a reCAPTCHA', () => {
      configOverrides.SECURITY_RECAPTCHA_ENABLED = true;

      expect(recaptchaErrorCodes({})).toEqual([]);
    });

    test('follows the enabled reCAPTCHA verification', () => {
      configOverrides.SECURITY_RECAPTCHA_ENABLED = false;
      expect(recaptchaErrorCodes({ recaptchaAction: 'login' })).toEqual([]);

      configOverrides.SECURITY_RECAPTCHA_ENABLED = true;
      expect(recaptchaErrorCodes({ recaptchaAction: 'login' })).toContain(
        ErrorCode.RecaptchaInvalid
      );
    });
  });

  describe('turnstileErrorCodes', () => {
    test('returns no codes for a route without a Turnstile', () => {
      configOverrides.SECURITY_TURNSTILE_ENABLED = true;

      expect(turnstileErrorCodes({})).toEqual([]);
    });

    test('returns no codes while the Turnstile verification is disabled', () => {
      configOverrides.SECURITY_TURNSTILE_ENABLED = false;

      expect(turnstileErrorCodes({ turnstile: true })).toEqual([]);
    });

    test('returns the Turnstile codes of an enabled route', () => {
      configOverrides.SECURITY_TURNSTILE_ENABLED = true;

      expect(turnstileErrorCodes({ turnstileAction: 'login' })).toEqual([
        ErrorCode.TurnstileMissing,
        ErrorCode.TurnstileInvalid,
        ErrorCode.TurnstileActionMismatch,
        ErrorCode.TurnstileUnavailable
      ]);
    });
  });

  describe('turnstileHeaderSchema', () => {
    test('declares no header for a route without a Turnstile', () => {
      configOverrides.SECURITY_TURNSTILE_ENABLED = true;

      expect(turnstileHeaderSchema({}).properties).toEqual({});
    });

    test('declares the configured header in lower case', () => {
      configOverrides.SECURITY_TURNSTILE_ENABLED = true;
      configOverrides.SECURITY_TURNSTILE_HEADER_NAME = 'X-Captcha-Token';

      const schema = turnstileHeaderSchema({ turnstileAction: 'login' });

      expect(Object.keys(schema.properties)).toEqual(['x-captcha-token']);
      expect(schema.required).toEqual(['x-captcha-token']);
      expect(schema.additionalProperties).toBe(true);
    });
  });

  describe('captchaErrorCodes', () => {
    test('combines the codes of both bot checks', () => {
      configOverrides.SECURITY_RECAPTCHA_ENABLED = true;
      configOverrides.SECURITY_TURNSTILE_ENABLED = true;

      const codes = captchaErrorCodes({ recaptcha: true, turnstile: true });

      expect(codes).toContain(ErrorCode.RecaptchaMissing);
      expect(codes).toContain(ErrorCode.TurnstileMissing);
    });

    test('returns only the codes of the checks the route enables', () => {
      configOverrides.SECURITY_RECAPTCHA_ENABLED = true;
      configOverrides.SECURITY_TURNSTILE_ENABLED = true;

      const codes = captchaErrorCodes({ turnstile: true });

      expect(codes).not.toContain(ErrorCode.RecaptchaMissing);
      expect(codes).toContain(ErrorCode.TurnstileMissing);
    });
  });

  describe('captchaHeaderSchema', () => {
    test('declares the headers of both bot checks', () => {
      configOverrides.SECURITY_RECAPTCHA_ENABLED = true;
      configOverrides.SECURITY_TURNSTILE_ENABLED = true;

      const schema = captchaHeaderSchema({ recaptcha: true, turnstile: true });

      expect(Object.keys(schema.properties).sort()).toEqual([
        'x-recaptcha-token',
        'x-turnstile-token'
      ]);
      expect(schema.additionalProperties).toBe(true);
    });

    test('declares no header without a bot check', () => {
      expect(captchaHeaderSchema({}).properties).toEqual({});
    });
  });
});
