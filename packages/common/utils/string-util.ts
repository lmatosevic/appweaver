import { DefaultGenerationOptions, generateApiKey } from 'generate-api-key';
import { getDayOfYear, getISOWeek } from 'date-fns';
import { v4 as uuidV4 } from 'uuid';
import { plural as pluralize } from 'pluralize';

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

export function randomString(
  length: number = 16,
  pool: string = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
): string {
  return generateToken('string', length, undefined, { pool });
}

export function generateToken(
  method:
    | 'bytes'
    | 'string'
    | 'base32'
    | 'base62'
    | 'uuidv4'
    | 'uuidv5' = 'base62',
  length: number = 16,
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

export function uuid(): string {
  return uuidV4();
}

export function plural(name: string): string {
  return pluralize(name);
}

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

export function camelToSnakeCase(text: string, divider: string = '_'): string {
  return text
    ?.split(/(?=[A-Z])/g)
    .join(divider)
    .toLowerCase();
}

export function snakeToCamelCase(text: string, divider: string = '_'): string {
  const regex = new RegExp(`${divider}[a-z0-9]`, 'g');
  return text?.replace(regex, (match) =>
    match.replace(divider, '').toUpperCase()
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  } else {
    return `${error}`;
  }
}

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
