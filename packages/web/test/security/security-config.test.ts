import { AuthSource, configOverrides, configSections } from '@appweaver/common';
import * as securityConfigs from '../../security/security-config';
import webModule from '../../module';

const providerSources = Object.values(AuthSource).filter((source) =>
  source.startsWith('oauth2')
);

/** The section of an OAuth2 provider, named after its auth source (`oauth2GoogleConfig`). */
function providerConfig(source: string): Record<string, unknown> {
  return (securityConfigs as Record<string, any>)[`${source}Config`];
}

describe('security-config', () => {
  describe('oauth2Config', () => {
    afterEach(() => {
      delete configOverrides.SECURITY_OAUTH2_GOOGLE_CLIENT_ID;
    });

    test('should define a section under security.oauth2 for every OAuth2 auth source', () => {
      // A provider without its section would silently never enable the connected accounts table
      for (const source of providerSources) {
        const values = providerConfig(source);
        const definition = [...configSections.values()].find(
          (section) => section.values === values
        );

        expect(definition?.section).toBe(
          `security.oauth2.${source.replace('oauth2', '').toLowerCase()}`
        );
        expect(values.ENABLED).toBe(false);
        expect(webModule.config).toContain(values);
      }
    });

    test('should read a provider key by its flattened name', () => {
      configOverrides.SECURITY_OAUTH2_GOOGLE_CLIENT_ID = 'google-client';

      expect(securityConfigs.oauth2GoogleConfig.CLIENT_ID).toBe(
        'google-client'
      );
    });

    test('should keep the general OAuth2 flags in their own section', () => {
      expect(securityConfigs.oauth2Config.REGISTRATION_ENABLED).toBe(true);
      expect(securityConfigs.oauth2Config).not.toHaveProperty('GOOGLE_ENABLED');
    });
  });
});
