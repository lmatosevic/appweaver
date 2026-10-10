import { AuthType, config, ErrorCode } from '@appweaver/common';
import {
  authErrorCodes,
  recaptchaErrorCodes
} from '../../security/auth-schema';

describe('auth-schema', () => {
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
        config.SECURITY_API_KEY_ENABLED
      );
    });
  });

  describe('recaptchaErrorCodes', () => {
    test('returns no codes for a route without a reCAPTCHA', () => {
      expect(recaptchaErrorCodes({})).toEqual([]);
    });

    test('follows the enabled reCAPTCHA verification', () => {
      const codes = recaptchaErrorCodes({ recaptchaAction: 'login' });

      expect(codes.length > 0).toBe(config.SECURITY_RECAPTCHA_ENABLED);
    });
  });
});
