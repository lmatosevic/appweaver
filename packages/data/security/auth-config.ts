import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const passwordConfig = defineConfig('security.password', {
  /** Enable password-based authentication. Default: `true`. */
  ENABLED: Type.Boolean({ default: true }),
  /** Minimum password length. Default: `8`. */
  MIN_LENGTH: Type.Integer({ default: 8 }),
  /** Maximum password length. Default: `100`. */
  MAX_LENGTH: Type.Integer({ default: 100 }),
  /** Require at least one uppercase letter. Default: `true`. */
  UPPERCASE: Type.Boolean({ default: true }),
  /** Require at least one lowercase letter. Default: `true`. */
  LOWERCASE: Type.Boolean({ default: true }),
  /** Require at least one digit. Default: `true`. */
  NUMERIC: Type.Boolean({ default: true }),
  /** Require at least one special character. Default: `true`. */
  SPECIAL: Type.Boolean({ default: true })
});

export const apiKeyConfig = defineConfig('security.apiKey', {
  /** Enable API key authentication. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** Keep the API key database table after migrations. Default: `false`. */
  KEEP_DATABASE_TABLE: Type.Boolean({ default: false }),
  /** Request the header name for the API key. Default: `'x-api-key'`. */
  HEADER_NAME: Type.String({ default: 'x-api-key' }),
  /** Maximum API key validity duration in milliseconds. */
  MAX_DURATION: Type.Optional(Type.Integer()),
  /** Prefix delimiter between key ID and secret value. Default: `'AK'`. */
  DELIMITER: Type.String({ default: 'AK' })
});

export const systemConfig = defineConfig('system', {
  /** Initial admin account email created on the first run. Default: `'admin@appweaver.co'`. */
  ADMIN_INITIAL_EMAIL: Type.String({ default: 'admin@appweaver.co' }),
  /** Initial admin account password. */
  ADMIN_INITIAL_PASSWORD: Type.Optional(Type.String())
});

export const connectedAccountConfig = defineConfig('security.oauth2', {
  /** Keep the `ConnectedAccount` database table even when every OAuth2 provider is disabled. Default: `false`. */
  CONNECTED_ACCOUNTS_KEEP_DATABASE_TABLE: Type.Boolean({ default: false })
});
