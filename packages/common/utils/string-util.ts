import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
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
      pool += categories[category as keyof typeof categories];
      includeUndefined = false;
    }
  }

  if (includeUndefined) {
    for (const [key, value] of Object.entries(categories)) {
      if (config[key as keyof typeof config] === undefined) {
        pool += value;
      }
    }
  }

  return generateToken('string', length, undefined, { pool });
}

/** The characters of a `string` token by default: letters, digits and `-._~+/`. */
const DEFAULT_TOKEN_POOL =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~+/';

const BASE62_POOL =
  '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** The options of a `string` token. */
export type TokenOptions = {
  /** The characters to draw from, `DEFAULT_TOKEN_POOL` by default */
  pool?: string;
};

/**
 * Generates a random token with the cryptographically secure generator of `node:crypto`.
 *
 * @param {'bytes' | 'string' | 'base32' | 'base62' | 'uuidv4'} [method='base62']
 *        The method to use for generating the token:
 *        - 'bytes': hexadecimal characters of random bytes.
 *        - 'string': characters drawn from the pool of the options (letters, digits and `-._~+/` by default).
 *        - 'base32': 16 random bytes in four RFC 4648 Base32 groups separated by dashes; the length is ignored.
 *        - 'base62': digits and letters.
 *        - 'uuidv4': a UUID version 4; the length is ignored.
 * @param {number} [length=32] The length of the token, without its prefix.
 * @param {string} [prefix] An optional prefix, joined to the token with a dot (`prefix.token`).
 * @param {TokenOptions} [options={}] The pool of a `string` token.
 * @return {string} The generated token as a string.
 */
export function generateToken(
  method: 'bytes' | 'string' | 'base32' | 'base62' | 'uuidv4' = 'base62',
  length: number = 32,
  prefix?: string,
  options: TokenOptions = {}
): string {
  const token = tokenOf(method, length, options);
  return prefix ? `${prefix}.${token}` : token;
}

/** The token of a method of `generateToken`, without its prefix. */
function tokenOf(
  method: 'bytes' | 'string' | 'base32' | 'base62' | 'uuidv4',
  length: number,
  options: TokenOptions
): string {
  switch (method) {
    case 'bytes':
      return randomBytes(Math.ceil(length / 2))
        .toString('hex')
        .slice(0, length);
    case 'string':
      return randomChars(options.pool ?? DEFAULT_TOKEN_POOL, length);
    case 'base32':
      return [0, 1, 2, 3].map(() => base32(randomBytes(4))).join('-');
    case 'uuidv4':
      return randomUUID();
    default:
      return randomChars(BASE62_POOL, length);
  }
}

/** Draws each character from the pool uniformly, with `randomInt` (no modulo bias). */
function randomChars(pool: string, length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += pool[randomInt(pool.length)];
  }
  return result;
}

/** Encodes bytes as RFC 4648 Base32, without padding. */
function base32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Generates a random UUID (Universally Unique Identifier) in version 4 format.
 *
 * @return {string} A randomly generated UUID in version 4 format, consisting of 36 characters
 * separated by hyphens in the format 8-4-4-4-12.
 */
export function uuidv4(): string {
  return randomUUID();
}

/**
 * Generates a UUID in version 7 format: the milliseconds of the given time, then random bits, so the ids sort by the
 * time they were generated at.
 *
 * @param {number} [time=Date.now()] - The time of the id, in milliseconds since the epoch.
 * @return {string} The UUID in the format 8-4-4-4-12.
 */
export function uuidv7(time: number = Date.now()): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(time, 0, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
 * Generates a hash of the given content using the specified algorithm and encoding. Supports strings, buffers, and
 * readable streams (streams are consumed chunk-by-chunk without buffering the whole content in memory, and therefore
 * resolve asynchronously).
 *
 * Can also be used to verify the integrity/authenticity of a file by comparing the calculated hash with a previously
 * stored one (e.g. the `checksum` field of an uploaded `File` resource).
 *
 * @param {Readable | Buffer | string} content - The stream (e.g. `fs.createReadStream(path)`), buffer or text to hash.
 * @param {'sha256'|'sha512'|'sha3-256'|'sha3-512'|'blake2s256'|'blake2s512'|'md5'} [algorithm='sha256'] - The hash algorithm to use.
 * @param {'base64'|'base64url'|'hex'|'binary'} [encoding='hex'] - The encoding format for the resulting hash.
 * @return {Promise<string> | string} The hash string in the specified encoding format, wrapped in a promise when the
 *         content is a readable stream.
 */
export function makeHash<T extends Readable | Buffer | string>(
  content: T,
  algorithm:
    | 'sha256'
    | 'sha512'
    | 'sha3-256'
    | 'sha3-512'
    | 'blake2s256'
    | 'blake2s512'
    | 'md' = 'sha256',
  encoding: 'base64' | 'base64url' | 'hex' | 'binary' = 'hex'
): T extends Readable ? Promise<string> : string {
  const hash = createHash(algorithm);

  if (content instanceof Readable) {
    return new Promise<string>((resolve, reject) => {
      content.on('data', (chunk) => hash.update(chunk));
      content.on('end', () => resolve(hash.digest(encoding)));
      content.on('error', (e) => reject(e));
    }) as T extends Readable ? Promise<string> : string;
  }

  return hash.update(content).digest(encoding) as T extends Readable
    ? Promise<string>
    : string;
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
 * Compares two version strings and determines their relative order.
 * The versions are compared numerically in a point-wise manner.
 *
 * @param {string} first - The first version string to compare, formatted as dot-separated numeric segments.
 * @param {string} second - The second version string to compare, formatted as dot-separated numeric segments.
 * @return {number} A negative number if `first` is less than `second`, positive if `first` is greater than `second`,
 * or 0 if they are equal.
 */
export function compareVersions(first: string, second: string): number {
  const firstVersionParts = first.split('.').map(Number);
  const secondVersionParts = second.split('.').map(Number);

  for (
    let i = 0;
    i < Math.max(firstVersionParts.length, secondVersionParts.length);
    i++
  ) {
    const diff = (firstVersionParts[i] ?? 0) - (secondVersionParts[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

/**
 * Checks if a version satisfies a range of the npm syntax: an exact version, `*`, a `^` or `~` range, a comparison
 * (`>=2.0.0 <3.0.0`), or alternatives joined by `||`. A prerelease is compared by its release version.
 *
 * @param {string} version - The version, i.e. `2.1.0`.
 * @param {string} range - The range, i.e. `^2.0.0`.
 * @return {boolean} `true` if the version is in the range.
 */
export function satisfiesVersion(version: string, range: string): boolean {
  const release = version.trim().replace(/^v/, '').split(/[-+]/)[0];

  return range.split('||').some((alternative) =>
    alternative
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .every((comparator) => satisfiesComparator(release, comparator))
  );
}

function satisfiesComparator(version: string, comparator: string): boolean {
  const [, operator, bound] = /^(\^|~|>=|<=|>|<|=)?v?(.*)$/.exec(comparator)!;
  if (['*', 'x', ''].includes(bound)) {
    return true;
  }

  const parts = bound.split('.').filter((part) => !/^[x*]$/i.test(part));
  const lower = parts.join('.');
  const compared = compareVersions(version, lower);

  switch (operator) {
    case '>=':
      return compared >= 0;
    case '>':
      return compared > 0;
    case '<=':
      return compared <= 0;
    case '<':
      return compared < 0;
    case '^': {
      // The first non-zero part stays, i.e. ^0.2.0 allows only 0.2.x
      const index = parts.findIndex((part) => Number(part) !== 0);
      const kept = index === -1 ? parts.length - 1 : index;
      return (
        compared >= 0 && compareVersions(version, nextVersion(parts, kept)) < 0
      );
    }
    case '~':
      return (
        compared >= 0 &&
        compareVersions(version, nextVersion(parts, parts.length > 1 ? 1 : 0)) <
          0
      );
    default:
      // A partial version, i.e. 2 or 2.1, matches every version it starts with
      return parts.length < 3
        ? compared >= 0 &&
            compareVersions(version, nextVersion(parts, parts.length - 1)) < 0
        : compared === 0;
  }
}

/** The version after the given parts with the part of the index raised, i.e. 2.1 at 0 is 3. */
function nextVersion(parts: string[], index: number): string {
  return parts
    .slice(0, index + 1)
    .map((part, i) => (i === index ? Number(part) + 1 : Number(part)))
    .join('.');
}

/**
 * Converts a human-readable size string (e.g., "1.5 MB", "2GB", "5k") into its equivalent size in bytes.
 *
 * @param {string} sizeText - A string representing the size with an optional unit (e.g., "KB", "MB", "GB", "TB").
 *                            If no unit is specified, it defaults to bytes.
 * @param {number} [defaultSize=0] - The default value for byte size in case `sizeText` is not in valid format.
 * @return {number} The size in bytes as a rounded integer. Returns 0 or `defaultSize` if the input string is empty or
 * invalid.
 */
export function textToBytes(
  sizeText?: string,
  defaultSize: number = 0
): number {
  let sizeInBytes = defaultSize;
  const units = ['k', 'm', 'g', 't'];

  if (!sizeText) {
    return sizeInBytes;
  }

  const matches = sizeText.matchAll(/([\d.]*)\s*([a-zA-Z]*)/g); // e.g. 1.52 MB
  const match = matches.next();

  if (match && match.value && match.value.length > 0) {
    const value = match.value[1];
    const unit = match.value[2];

    let multiplier = 1;
    if (unit) {
      const unitSymbol = unit.toLowerCase().replace(/i?b$/, '');
      const index = units.indexOf(unitSymbol);
      if (index !== -1) {
        multiplier = Math.pow(1024, index + 1);
      }
    }

    let numericalValue = 1;
    if (value) {
      const number = parseFloat(value);
      if (!isNaN(number)) {
        numericalValue = number;
      }
    }

    sizeInBytes = numericalValue * multiplier;
  }

  return Math.round(sizeInBytes);
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
    yearWeek: isoWeekOfYear(now),
    yearDay: dayOfYear(now),
    hours: now.getUTCHours(),
    minutes: now.getUTCMinutes(),
    seconds: now.getUTCSeconds(),
    milliseconds: now.getUTCMilliseconds(),
    timestamp: now.getTime(),
    date: now.toISOString().replace(/[:.]/g, '-'),
    uuid: uuidv4(),
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

/**
 * Converts a value into text: a date in the ISO format, another object as JSON, `null` and `undefined` as an empty
 * string.
 *
 * @param {unknown} value - The value to convert.
 * @return {string} The text of the value.
 */
export function toText(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
      return value.toString();
    case 'undefined':
      return '';
    default:
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value === null ? '' : (JSON.stringify(value) ?? '');
  }
}

/** Returns the ISO 8601 week of the year of a date in UTC, from 1 to 53. */
function isoWeekOfYear(date: Date): number {
  const day = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  // The Thursday of the week decides the year the week belongs to
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** Returns the day of the year of a date in UTC, from 1 to 366. */
function dayOfYear(date: Date): number {
  const day = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  );
  return (day - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000 + 1;
}
