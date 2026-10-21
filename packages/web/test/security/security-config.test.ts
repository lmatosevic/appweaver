import { AuthSource } from '@appweaver/common';
import { oauth2Config } from '../../security/security-config';

describe('security-config', () => {
  describe('oauth2Config', () => {
    const providerFlags = Object.values(AuthSource)
      .filter((source) => source.startsWith('oauth2'))
      .map((source) => `${source.replace('oauth2', '').toUpperCase()}_ENABLED`);

    test('resolves a config flag for every OAuth2 auth source', () => {
      // A provider whose flag is missing would silently never enable the connected accounts table
      for (const flag of providerFlags) {
        expect(oauth2Config).toHaveProperty(flag);
      }
    });

    test('ignores the general OAuth2 flags that are on by default', () => {
      expect(oauth2Config.REGISTRATION_ENABLED).toBe(true);
      expect(providerFlags).not.toContain('REGISTRATION_ENABLED');
    });
  });
});
