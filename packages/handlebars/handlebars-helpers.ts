import Handlebars, { HelperDelegate, HelperOptions } from 'handlebars';
import { isArray, isString, toText } from '@appweaver/common';
import { LocaleService } from '@appweaver/core';

const DATE_STYLES = new Set(['full', 'long', 'medium', 'short']);

/**
 * Creates the built-in helpers of the Handlebars template engine.
 *
 * @param {LocaleService} localeService - The locale service translating the `t` helper keys.
 * @return {Record<string, HelperDelegate>} The helpers keyed by name.
 */
export function createHandlebarsHelpers(
  localeService: LocaleService
): Record<string, HelperDelegate> {
  return {
    t(key: string, ...args: unknown[]) {
      const [options, [locale]] = splitArgs(args);
      return localeService.translate(
        String(key),
        isString(locale) ? locale : options.data?.locale,
        options.hash
      );
    },

    eq: (a: unknown, b: unknown) => a === b,
    ne: (a: unknown, b: unknown) => a !== b,
    lt: (a: any, b: any) => a < b,
    lte: (a: any, b: any) => a <= b,
    gt: (a: any, b: any) => a > b,
    gte: (a: any, b: any) => a >= b,
    and: (...args: unknown[]) => splitArgs(args)[1].every(Boolean),
    or: (...args: unknown[]) => splitArgs(args)[1].some(Boolean),
    not: (value: unknown) => !value,
    default: (value: unknown, fallback: unknown) =>
      value === undefined || value === null || value === '' ? fallback : value,
    includes: (value: unknown, item: unknown) =>
      isArray(value) || isString(value) ? value.includes(item as any) : false,
    length: (value: unknown) =>
      isArray(value) || isString(value) ? value.length : 0,

    add: (a: unknown, b: unknown) => Number(a) + Number(b),
    subtract: (a: unknown, b: unknown) => Number(a) - Number(b),
    multiply: (a: unknown, b: unknown) => Number(a) * Number(b),
    divide: (a: unknown, b: unknown) => Number(a) / Number(b),

    uppercase: (value: unknown) => toText(value).toUpperCase(),
    lowercase: (value: unknown) => toText(value).toLowerCase(),
    trim: (value: unknown) => toText(value).trim(),
    truncate(value: unknown, length: number, ...args: unknown[]) {
      const [, [suffix]] = splitArgs(args);
      const text = toText(value);
      const end = isString(suffix) ? suffix : '…';
      return text.length > length ? text.slice(0, length) + end : text;
    },
    join(value: unknown, ...args: unknown[]) {
      const [, [separator]] = splitArgs(args);
      return isArray(value)
        ? value.join(isString(separator) ? separator : ', ')
        : toText(value);
    },
    concat: (...args: unknown[]) => splitArgs(args)[1].map(toText).join(''),

    json(value: unknown, ...args: unknown[]) {
      const [, [indent]] = splitArgs(args);
      return JSON.stringify(value, null, Number(indent) || undefined) ?? '';
    },
    cdata: (value: unknown) =>
      new Handlebars.SafeString(
        `<![CDATA[${toText(value).replaceAll(']]>', ']]]]><![CDATA[>')}]]>`
      ),

    formatDate(value: unknown, ...args: unknown[]) {
      const [options, [style]] = splitArgs(args);
      const date = toDate(value);
      if (!date) {
        return '';
      }
      if (style === 'iso') {
        return date.toISOString();
      }
      const formatOptions: Intl.DateTimeFormatOptions = { ...options.hash };
      if (isString(style) && DATE_STYLES.has(style)) {
        formatOptions.dateStyle =
          style as Intl.DateTimeFormatOptions['dateStyle'];
      }
      return new Intl.DateTimeFormat(
        options.data?.locale,
        formatOptions
      ).format(date);
    },
    formatNumber(value: unknown, ...args: unknown[]) {
      const [options] = splitArgs(args);
      return formatNumber(value, options.data?.locale, options.hash);
    },
    formatCurrency(value: unknown, currency: string, ...args: unknown[]) {
      const [options] = splitArgs(args);
      return formatNumber(value, options.data?.locale, {
        ...options.hash,
        style: 'currency',
        currency
      });
    }
  };
}

/** Splits the helper arguments into the Handlebars options, always passed last, and the positional arguments. */
function splitArgs(args: unknown[]): [HelperOptions, any[]] {
  return [args[args.length - 1] as HelperOptions, args.slice(0, -1)];
}

function toDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatNumber(
  value: unknown,
  locale: string | undefined,
  options: Intl.NumberFormatOptions
): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  const number = Number(value);
  return Number.isNaN(number)
    ? toText(value)
    : new Intl.NumberFormat(locale, options).format(number);
}
