import { isIPv4, isIPv6 } from 'node:net';
import { FormatRegistry } from '@sinclair/typebox';

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:z|[+-](\d{2}):?(\d{2}))$/i;
const DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const EMAIL =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
const HOSTNAME =
  /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i;
const URI_SCHEME = /^[a-z][a-z0-9+\-.]*:[^\s]*$/i;
const UUID = /^(?:urn:uuid:)?[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

function isDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) {
    return false;
  }
  const [year, month, day] = match.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = month === 2 && leap ? 29 : DAYS[month];
  return month >= 1 && month <= 12 && day >= 1 && day <= days;
}

function isTime(value: string): boolean {
  const match = TIME.exec(value);
  if (!match) {
    return false;
  }
  const [hour, minute, second, zoneHour, zoneMinute] = match
    .slice(1)
    .map((part) => Number(part ?? 0));
  // The second 60 is a leap second.
  return (
    hour <= 23 &&
    minute <= 59 &&
    second <= 60 &&
    zoneHour <= 23 &&
    zoneMinute <= 59
  );
}

/**
 * The string formats of `registerSchemaFormats`, checked like the full formats of ajv-formats the HTTP routes validate
 * with.
 */
export const schemaFormats: Readonly<
  Record<string, (value: string) => boolean>
> = {
  date: isDate,
  time: isTime,
  'date-time': (value) => {
    const parts = value.split(/t|\s/i);
    return parts.length === 2 && isDate(parts[0]) && isTime(parts[1]);
  },
  email: (value) => EMAIL.test(value),
  hostname: (value) => HOSTNAME.test(value),
  ipv4: isIPv4,
  ipv6: isIPv6,
  uri: (value) => URI_SCHEME.test(value) && URL.canParse(value),
  uuid: (value) => UUID.test(value),
  binary: () => true,
  password: () => true
};

/**
 * Registers the `schemaFormats` in the `FormatRegistry` of TypeBox, which checks none by default, so a schema with a
 * `format` passes `Value.Check` and `TypeCompiler`. A format registered already is kept, so the one of an application
 * wins.
 */
export function registerSchemaFormats(): void {
  for (const [name, check] of Object.entries(schemaFormats)) {
    if (!FormatRegistry.Has(name)) {
      FormatRegistry.Set(name, check);
    }
  }
}
