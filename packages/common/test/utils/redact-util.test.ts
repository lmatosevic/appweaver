import {
  isSecretName,
  REDACTED,
  redactSecrets,
  SECRET_NAMES
} from '../../utils/redact-util';

describe('redact-util', () => {
  describe('isSecretName', () => {
    test.each([
      'password',
      'passwordHash',
      'newPassword',
      'clientSecret',
      'accessToken',
      'refresh_token',
      'apiKey',
      'x-api-key',
      'DB_PASSWORD',
      'PRIVATE_KEY',
      'GOOGLE_CREDENTIALS'
    ])('treats %s as a secret', (name) => {
      expect(isSecretName(name)).toBe(true);
    });

    test.each(['email', 'title', 'maxTokens', 'tokenId', 'keyHash'])(
      'treats %s as no secret',
      (name) => {
        expect(isSecretName(name)).toBe(false);
      }
    );

    test('treats the extra names as secrets, in any case', () => {
      expect(isSecretName('Code', ['code'])).toBe(true);
      expect(isSecretName('postalCode', ['code'])).toBe(false);
    });

    test('covers every name the logger redacts', () => {
      expect(SECRET_NAMES.every((name) => isSecretName(name))).toBe(true);
    });
  });

  describe('redactSecrets', () => {
    test('replaces the values of the secret keys, nested ones too', () => {
      const redacted = redactSecrets({
        email: 'user@test.com',
        password: 'Secret1!',
        nested: { token: 'abc', items: [{ apiKey: 'key', name: 'one' }] }
      });

      expect(redacted).toEqual({
        email: 'user@test.com',
        password: REDACTED,
        nested: { token: REDACTED, items: [{ apiKey: REDACTED, name: 'one' }] }
      });
    });

    test('redacts the extra keys', () => {
      expect(redactSecrets({ code: '123456' }, ['code'])).toEqual({
        code: REDACTED
      });
    });

    test('keeps the empty secrets and the values that are not plain objects', () => {
      const date = new Date();

      expect(redactSecrets({ password: null, date })).toEqual({
        password: null,
        date
      });
      expect(redactSecrets('password')).toBe('password');
      expect(redactSecrets(null)).toBeNull();
    });

    test('leaves the original value unchanged', () => {
      const value = { password: 'Secret1!' };

      redactSecrets(value);

      expect(value.password).toBe('Secret1!');
    });

    test('stops at a deep nesting', () => {
      let value: Record<string, unknown> = { password: 'deep' };
      for (let i = 0; i < 40; i++) {
        value = { child: value };
      }

      expect(() => redactSecrets(value)).not.toThrow();
    });
  });
});
