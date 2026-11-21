import { camelToSnakeCase } from './string-util';

/** The value a redacted secret is replaced with. */
export const REDACTED = '[Redacted]';

/** The names of the credentials a log record or an audit entry may carry, redacted by the logger. */
export const SECRET_NAMES = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret'
];

// Matched against the name in upper snake case, so `clientSecret`, `DB_PASSWORD` and `x-api-key` are secrets
const SECRET_NAME =
  /(PASSWORD|PASSWORD_HASH|SECRET|TOKEN|PRIVATE_KEY|CREDENTIALS|API_KEY)$/;

const MAX_DEPTH = 32;

/**
 * Tells whether a name holds a secret: a password, a secret, a token, a private key, credentials or an API key, in
 * any case (`clientSecret`, `DB_PASSWORD`, `x-api-key`), or one of the extra names, compared case-insensitively.
 *
 * @param {string} name - The name of a key, a field or a header.
 * @param {string[]} [extra=[]] - Other names to treat as secrets.
 * @return {boolean} True for the name of a secret.
 */
export function isSecretName(name: string, extra: string[] = []): boolean {
  const normalized = camelToSnakeCase(name).replaceAll('-', '_').toUpperCase();
  const lower = name.toLowerCase();
  return (
    SECRET_NAME.test(normalized) ||
    extra.some((key) => key.toLowerCase() === lower)
  );
}

/**
 * Copies a value with the values of its secret keys (see {@link isSecretName}) replaced with {@link REDACTED}, in its
 * nested objects and arrays too.
 *
 * @param {unknown} value - The value to redact.
 * @param {string[]} [extra=[]] - Other key names to redact.
 * @return {unknown} The redacted copy, or the value itself when it is neither an object nor an array.
 */
export function redactSecrets<T>(value: T, extra: string[] = []): T {
  return redactValue(value, extra, 0) as T;
}

function redactValue(value: unknown, extra: string[], depth: number): unknown {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, extra, depth + 1));
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      item !== undefined && item !== null && isSecretName(key, extra)
        ? REDACTED
        : redactValue(item, extra, depth + 1)
    ])
  );
}
