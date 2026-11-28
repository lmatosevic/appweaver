import { ConfigurationError, ErrorCode } from '../errors';

/**
 * Parses the environment value of an array key: a JSON array (`["a","b"]`), or a comma-separated list whose items are
 * trimmed (`a, b`). A value that only looks like one of them is rejected instead of becoming a single item: a JSON
 * array that does not parse, an empty item (`a,,b`), or a quoted item (`"a","b"`), since a comma-separated list has no
 * quoting.
 *
 * @param {string} key - The flattened name of the key, named by the error.
 * @param {string} value - The value of the environment variable.
 * @param {unknown[]} [defaultValue=[]] - The value of an empty string.
 * @return {unknown[]} The items: strings, or the JSON values of a JSON array.
 * @throws {ConfigurationError} `CONFIGURATION_INVALID` for an ambiguous value.
 */
export function parseEnvArray(
  key: string,
  value: string,
  defaultValue: unknown[] = []
): unknown[] {
  const trimmed = value.trim();
  if (trimmed === '') {
    return defaultValue;
  }

  if (trimmed.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw invalidArray(key, 'a JSON array that does not parse');
    }
    if (!Array.isArray(parsed)) {
      throw invalidArray(key, 'a JSON value that is not an array');
    }
    return parsed;
  }

  const items = trimmed.split(',').map((item) => item.trim());
  if (items.some((item) => item === '')) {
    throw invalidArray(key, 'an empty item of the comma-separated list');
  }
  if (items.some((item) => /^["']|["']$/.test(item))) {
    throw invalidArray(
      key,
      'a quoted item of the comma-separated list (write a JSON array instead)'
    );
  }
  return items;
}

function invalidArray(key: string, reason: string): ConfigurationError {
  return new ConfigurationError(
    ErrorCode.ConfigurationInvalid,
    `Invalid config: ${key} is ${reason}`,
    { errors: [`${key}: ${reason}`] }
  );
}
