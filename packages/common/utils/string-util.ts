import { randomUUID, createHash } from 'node:crypto';
import { DefaultGenerationOptions, generateApiKey } from 'generate-api-key';
import { getDayOfYear, getISOWeek } from 'date-fns';
import { plural as pluralize, singular as singularize } from 'pluralize';

/**
 * Parses a string into an array of strings, splitting it by a specified delimiter.
 * If the input value is null or undefined, a default array is returned.
 *
 * @param {string | null | undefined} value - The string to parse. If null or undefined, the default array is returned.
 * @param {string[]} [defaultVal=[]] - The default array to return if the input value is null or undefined.
 * @param {string} [delimiter=','] - The delimiter used to split the input string into an array.
 * @return {string[]} An array of strings obtained by splitting the input string, or the default array if the input is
 *          null or undefined.
 */
export function parseArray(
  value?: string | null,
  defaultVal: string[] = [],
  delimiter: string = ','
): string[] {
  if (!value) {
    return defaultVal;
  }
  return value.split(delimiter);
}

/**
 * Generates a random string based on the specified length and character set configuration.
 *
 * @param {number} [length=16] - The desired length of the generated string.
 * @param {Object} [config={}] - Configuration object to specify which character sets to include.
 *                               Everything is included by default.
 * @param {boolean} [config.numbers] - Whether to include numeric characters (0-9).
 * @param {boolean} [config.lowercase] - Whether to include lowercase alphabetic characters (a-z).
 * @param {boolean} [config.uppercase] - Whether to include uppercase alphabetic characters (A-Z).
 * @param {boolean} [config.special] - Whether to include special characters (!#$%&()*+,-./:;<=>?@[]^_{|}~).
 * @param {boolean} [config.extra] - Whether to include extra special characters (\"'`).
 * @return {string} A randomly generated string based on the provided length and configuration.
 */
export function randomString(
  length: number = 32,
  config: {
    numbers?: boolean;
    lowercase?: boolean;
    uppercase?: boolean;
    special?: boolean;
    extra?: boolean;
  } = {}
): string {
  const categories = {
    numbers: '0123456789',
    lowercase: 'abcdefghijklmnopqrstuvwxyz',
    uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    special: '!#$%&()*+,-./:;<=>?@[]^_{|}~',
    extra: '\\"\'`'
  };

  let pool = '';
  let includeUndefined = true;
  for (const [category, include] of Object.entries(config)) {
    if (include) {
      pool += categories[category];
      includeUndefined = false;
    }
  }

  if (includeUndefined) {
    for (const [key, value] of Object.entries(categories)) {
      if (config[key] === undefined) {
        pool += value;
      }
    }
  }

  return generateToken('string', length, undefined, { pool });
}

/**
 * Generates a token based on the specified method, length, and options.
 *
 * @param {'bytes' | 'string' | 'base32' | 'base62' | 'uuidv4' | 'uuidv5'} [method='base62']
 *        The method to use for generating the token. Options include:
 *        - 'bytes': Generates a token using raw bytes.
 *        - 'string': Generates a token as a simple string.
 *        - 'base32': Generates a token encoded in Base32 format.
 *        - 'base62': Generates a token encoded in Base62 format.
 *        - 'uuidv4': Generates a UUID version 4 token.
 *        - 'uuidv5': Generates a UUID version 5 token.
 * @param {number} [length=16]
 *        The length of the token to generate. The default is 16.
 * @param {string} [prefix]
 *        An optional prefix to prepend to the generated token.
 * @param {DefaultGenerationOptions} [options={}]
 *        Additional optional configuration options for token generation.
 * @return {string} The generated token as a string.
 */
export function generateToken(
  method:
    | 'bytes'
    | 'string'
    | 'base32'
    | 'base62'
    | 'uuidv4'
    | 'uuidv5' = 'base62',
  length: number = 32,
  prefix?: string,
  options: DefaultGenerationOptions = {}
): string {
  return generateApiKey({
    method,
    length,
    prefix,
    ...options
  }) as string;
}

/**
 * Generates a random UUID (Universally Unique Identifier) in version 4 format.
 *
 * @return {string} A randomly generated UUID in version 4 format, consisting of 36 characters
 * separated by hyphens in the format 8-4-4-4-12.
 */
export function uuid(): string {
  return randomUUID();
}

/**
 * Converts a given singular noun into its plural form.
 *
 * @param {string} name - The singular noun to be pluralized.
 * @return {string} The plural form of the given noun.
 */
export function plural(name: string): string {
  return pluralize(name);
}

/**
 * Converts a given plural string into its singular form.
 *
 * @param name The plural string to be converted.
 * @return The singular form of the given string.
 */
export function singular(name: string): string {
  return singularize(name);
}

/**
 * Converts the first character of a string to uppercase while leaving the rest unchanged.
 *
 * @param text - The input string to be capitalized.
 * @return The string with the first character converted to uppercase.
 */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Converts the first character of the given string to lowercase while leaving the rest of the string unchanged.
 *
 * @param {string} text - The string to be processed.
 * @return {string} The resulting string with the first character converted to lowercase.
 */
export function uncapitalize(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Generates a hash string from the given text using the specified algorithm and encoding.
 *
 * @param {string} text - The input text to be hashed.
 * @param {'sha256'|'sha512'|'sha3-256'|'sha3-512'|'blake2s256'|'blake2s512'|'md5'} [algorithm='sha256'] - The hash algorithm to use.
 * @param {'base64'|'base64url'|'hex'|'binary'} [encoding='hex'] - The encoding format for the resulting hash.
 * @return {string} The resulting hash string in the specified encoding format.
 */
export function makeHash(
  text: string,
  algorithm:
    | 'sha256'
    | 'sha512'
    | 'sha3-256'
    | 'sha3-512'
    | 'blake2s256'
    | 'blake2s512'
    | 'md5' = 'sha256',
  encoding: 'base64' | 'base64url' | 'hex' | 'binary' = 'hex'
): string {
  return createHash(algorithm).update(text).digest(encoding);
}

/**
 * Converts an array of strings into a URL-friendly slug.
 *
 * @param {...string[]} values - The strings to be combined and converted into a slug.
 * @return {string} A URL-friendly slug generated by concatenating the input strings, normalizing,
 *         and removing unwanted characters.
 */
export function makeUrlSlug(...values: string[]): string {
  return values
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z\d ]/g, '')
    .replace(/\s+/g, '-');
}

/**
 * Converts a camelCase string to snake_case format using the specified divider.
 *
 * @param {string} text - The camelCase string to be converted.
 * @param {string} [divider='_'] - The divider used to separate words in the resulting snake_case string.
 *        Defaults to an underscore ('_').
 * @return {string} The converted snake_case string.
 */
export function camelToSnakeCase(text: string, divider: string = '_'): string {
  return text
    ?.replace(/([a-z0-9])([A-Z])/g, `$1${divider}$2`)
    .replace(/([A-Z])([A-Z][a-z])/g, `$1${divider}$2`)
    .toLowerCase();
}

/**
 * Converts a snake_case string to camelCase.
 *
 * @param {string} text - The input string in snake_case format.
 * @param {string} [divider='_'] - The character used to divide words in the input string. Defaults to '_'.
 * @return {string} The converted string in camelCase format.
 */
export function snakeToCamelCase(text: string, divider: string = '_'): string {
  const regex = new RegExp(`${divider}[a-z0-9]`, 'g');
  return text?.replace(regex, (match) =>
    match.replace(divider, '').toUpperCase()
  );
}

/**
 * Extracts and returns the error message from an unknown error object.
 *
 * @param {unknown} error - The error object from which to retrieve the message.
 * @return {string} The extracted error message or a string representation of the error.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  } else {
    return `${error}`;
  }
}

/**
 * Replaces pattern variables in a given string with their corresponding values.
 *
 * @param {string} pattern The string containing variables in the format `{variableName}` to be replaced.
 * @param {Record<string, any>} [extraVariables={}] An object containing additional variables to be used for replacement.
 *        The keys represent variable names, and the values are the replacement values.
 * @return {string} The string with all the pattern variables replaced by their respective values.
 */
export function replacePatternVariables(
  pattern: string,
  extraVariables: Record<string, any> = {}
): string {
  const now = new Date();
  const variables = {
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
    day: now.getUTCDate(),
    weekDay: now.getUTCDay(),
    yearWeek: getISOWeek(now),
    yearDay: getDayOfYear(now),
    hours: now.getUTCHours(),
    minutes: now.getUTCMinutes(),
    seconds: now.getUTCSeconds(),
    milliseconds: now.getUTCMilliseconds(),
    timestamp: now.getTime(),
    uuid: uuid(),
    hash: generateToken('bytes', 32)
  };

  let name = pattern;

  for (const [key, value] of Object.entries({
    ...variables,
    ...extraVariables
  })) {
    const regex = new RegExp(`{${key}}`, 'g');
    name = name.replace(regex, `${value}`);
  }

  return name;
}
