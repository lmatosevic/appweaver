import { AuthScope } from '@appweaver/common';
import {
  checkScopeAccess,
  validateRedirectUrl
} from '../../security/access-util';

describe('access-util', () => {
  describe('validateRedirectUrl', () => {
    test('accepts any host by default', () => {
      expect(validateRedirectUrl('https://example.com/callback')).toEqual({
        valid: true,
        message: 'URL is valid and allowed'
      });
    });

    test('rejects a malformed URL', () => {
      const result = validateRedirectUrl('not-a-url');

      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid URL format');
    });

    test('rejects an empty URL', () => {
      expect(validateRedirectUrl('').valid).toBe(false);
    });
  });

  describe('checkScopeAccess', () => {
    test('allows a regular route for the auth scope', () => {
      expect(checkScopeAccess('/api/posts', AuthScope.Auth)).toBe(true);
    });

    test('blocks the refresh route for the auth scope', () => {
      expect(checkScopeAccess('/auth/refresh', AuthScope.Auth)).toBe(false);
    });

    test('allows only the refresh route for the refresh scope', () => {
      expect(checkScopeAccess('/auth/refresh', AuthScope.Refresh)).toBe(true);
      expect(checkScopeAccess('/api/posts', AuthScope.Refresh)).toBe(false);
      expect(checkScopeAccess('/auth/me', AuthScope.Refresh)).toBe(false);
    });

    test('allows the 2FA verification route only for the 2FA scope', () => {
      expect(
        checkScopeAccess('/auth/account/verify-2fa-code', AuthScope.TwoFA)
      ).toBe(true);
      expect(
        checkScopeAccess('/auth/account/verify-2fa-code', AuthScope.Auth)
      ).toBe(false);
      expect(checkScopeAccess('/api/posts', AuthScope.TwoFA)).toBe(false);
    });

    test('allows the 2FA code request route only for the 2FA scope', () => {
      expect(
        checkScopeAccess('/auth/account/send-2fa-code', AuthScope.TwoFA)
      ).toBe(true);
      expect(
        checkScopeAccess('/auth/account/send-2fa-code', AuthScope.Auth)
      ).toBe(false);
      expect(
        checkScopeAccess('/auth/account/send-2fa-code', AuthScope.Refresh)
      ).toBe(false);
    });

    test('denies access for an unknown scope', () => {
      expect(checkScopeAccess('/api/posts', 'unknown' as AuthScope)).toBe(
        false
      );
    });
  });
});
