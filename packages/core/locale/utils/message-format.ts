import { toText } from '@appweaver/common';

/**
 * A parsed message of the ICU MessageFormat subset the translations use:
 *
 * - `{name}` writes a parameter as it is
 * - `{name, number}`, `{name, number, integer}` and `{name, number, percent}` format a number in the locale
 * - `{name, plural, =0 {...} one {...} other {...}}` selects a branch by the plural category of the locale, `#` writes
 *   the number, and `offset:1` subtracts from it
 * - `{name, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}` selects by the ordinal category
 * - `{name, select, female {...} male {...} other {...}}` selects a branch by the value
 * - `''` writes an apostrophe, and an apostrophe before `{`, `}` or `#` quotes the text up to the next one
 */
export type MessagePart =
  | string
  | { type: 'pound' }
  | { type: 'argument'; name: string; raw: string }
  | { type: 'number'; name: string; style?: string; raw: string }
  | {
      type: 'plural';
      name: string;
      ordinal: boolean;
      offset: number;
      options: Record<string, MessagePart[]>;
      raw: string;
    }
  | {
      type: 'select';
      name: string;
      options: Record<string, MessagePart[]>;
      raw: string;
    };

const NAME = /[\w.-]+/y;
const SELECTOR = /=-?\d+(\.\d+)?|[\w-]+/y;

const parsedMessages = new Map<string, MessagePart[]>();
const pluralRules = new Map<string, Intl.PluralRules>();
const numberFormats = new Map<string, Intl.NumberFormat>();

/**
 * Parses a message, keeping the result for the next calls.
 *
 * @param {string} message - The message.
 * @return {MessagePart[]} The parts of the message.
 * @throws {Error} If the message is not valid, naming the position of the error.
 */
export function parseMessage(message: string): MessagePart[] {
  let parts = parsedMessages.get(message);
  if (!parts) {
    parts = new MessageParser(message).parse();
    parsedMessages.set(message, parts);
  }
  return parts;
}

/**
 * Formats a message with the parameters in a locale. An argument whose parameter is missing is written as it is in the
 * message, i.e. `{name}`.
 *
 * @param {string} message - The message.
 * @param {Record<string, unknown>} params - The values of the arguments.
 * @param {string} locale - The locale of the plural rules and the number formats.
 * @return {string} The formatted message.
 * @throws {Error} If the message is not valid.
 */
export function formatMessage(
  message: string,
  params: Record<string, unknown>,
  locale: string
): string {
  return formatParts(parseMessage(message), params, locale);
}

function formatParts(
  parts: MessagePart[],
  params: Record<string, unknown>,
  locale: string,
  pound?: number
): string {
  let result = '';

  for (const part of parts) {
    if (typeof part === 'string') {
      result += part;
      continue;
    }
    if (part.type === 'pound') {
      result += pound === undefined ? '#' : numberFormat(locale).format(pound);
      continue;
    }

    const value = Object.hasOwn(params, part.name)
      ? params[part.name]
      : undefined;
    if (value === undefined || value === null) {
      result += part.raw;
      continue;
    }

    switch (part.type) {
      case 'argument':
        result += toText(value);
        break;
      case 'number':
        result += numberFormat(locale, part.style).format(Number(value));
        break;
      case 'plural': {
        const number = Number(value);
        const branch =
          part.options[`=${number}`] ??
          part.options[
            rules(locale, part.ordinal).select(number - part.offset)
          ] ??
          part.options.other;
        result += formatParts(branch, params, locale, number - part.offset);
        break;
      }
      case 'select': {
        const branch = part.options[toText(value)] ?? part.options.other;
        result += branch
          ? formatParts(branch, params, locale, pound)
          : part.raw;
        break;
      }
    }
  }

  return result;
}

function rules(locale: string, ordinal: boolean): Intl.PluralRules {
  const key = `${locale}|${ordinal}`;
  let pluralRule = pluralRules.get(key);
  if (!pluralRule) {
    pluralRule = new Intl.PluralRules(locale, {
      type: ordinal ? 'ordinal' : 'cardinal'
    });
    pluralRules.set(key, pluralRule);
  }
  return pluralRule;
}

function numberFormat(locale: string, style?: string): Intl.NumberFormat {
  const key = `${locale}|${style ?? ''}`;
  let format = numberFormats.get(key);
  if (!format) {
    const options: Intl.NumberFormatOptions =
      style === 'integer'
        ? { maximumFractionDigits: 0 }
        : style === 'percent'
          ? { style: 'percent' }
          : {};
    format = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, format);
  }
  return format;
}

class MessageParser {
  private index = 0;

  constructor(private readonly message: string) {}

  public parse(): MessagePart[] {
    const parts = this.parseParts(false, false);
    if (this.index < this.message.length) {
      this.fail(`unexpected '${this.message[this.index]}'`);
    }
    return parts;
  }

  private parseParts(inPlural: boolean, nested: boolean): MessagePart[] {
    const parts: MessagePart[] = [];
    const text = (value: string) => {
      const last = parts.length - 1;
      if (typeof parts[last] === 'string') {
        parts[last] += value;
      } else {
        parts.push(value);
      }
    };

    while (this.index < this.message.length) {
      const char = this.message[this.index];

      if (char === '}') {
        if (!nested) {
          this.fail("unexpected '}'");
        }
        break;
      }
      if (char === '{') {
        parts.push(this.parseArgument(inPlural));
      } else if (char === '#' && inPlural) {
        parts.push({ type: 'pound' });
        this.index++;
      } else if (char === "'") {
        text(this.parseApostrophe(inPlural));
      } else {
        text(char);
        this.index++;
      }
    }

    return parts;
  }

  private parseApostrophe(inPlural: boolean): string {
    const next = this.message[this.index + 1];
    if (next === "'") {
      this.index += 2;
      return "'";
    }
    if (next !== '{' && next !== '}' && !(next === '#' && inPlural)) {
      this.index++;
      return "'";
    }

    // A quoted literal up to the next single apostrophe, or the end
    let literal = '';
    this.index++;
    while (this.index < this.message.length) {
      const char = this.message[this.index];
      if (char === "'") {
        if (this.message[this.index + 1] === "'") {
          literal += "'";
          this.index += 2;
          continue;
        }
        this.index++;
        break;
      }
      literal += char;
      this.index++;
    }
    return literal;
  }

  private parseArgument(inPlural: boolean): MessagePart {
    const start = this.index;

    this.index++;
    this.skipSpaces();
    const name = this.match(NAME, 'an argument name');
    this.skipSpaces();

    if (this.consume('}')) {
      return { type: 'argument', name, raw: this.raw(start) };
    }
    if (!this.consume(',')) {
      this.fail("expected '}' or ','");
    }
    this.skipSpaces();
    const type = this.match(NAME, 'an argument type');
    this.skipSpaces();

    switch (type) {
      case 'number': {
        let style: string | undefined;
        if (this.consume(',')) {
          this.skipSpaces();
          style = this.match(NAME, 'a number style');
          if (style !== 'integer' && style !== 'percent') {
            this.fail(`unsupported number style '${style}'`);
          }
          this.skipSpaces();
        }
        this.expect('}');
        return { type: 'number', name, style, raw: this.raw(start) };
      }
      case 'plural':
      case 'selectordinal': {
        this.expect(',');
        this.skipSpaces();
        let offset = 0;
        if (this.message.startsWith('offset:', this.index)) {
          this.index += 'offset:'.length;
          this.skipSpaces();
          offset = Number(this.match(/\d+/y, 'an offset'));
        }
        const options = this.parseOptions(true);
        return {
          type: 'plural',
          name,
          ordinal: type === 'selectordinal',
          offset,
          options,
          raw: this.raw(start)
        };
      }
      case 'select': {
        this.expect(',');
        const options = this.parseOptions(inPlural);
        return { type: 'select', name, options, raw: this.raw(start) };
      }
      default:
        return this.fail(`unsupported argument type '${type}'`);
    }
  }

  private parseOptions(inPlural: boolean): Record<string, MessagePart[]> {
    const options: Record<string, MessagePart[]> = Object.create(null);

    this.skipSpaces();
    while (!this.consume('}')) {
      const selector = this.match(SELECTOR, 'a selector');
      this.skipSpaces();
      this.expect('{');
      options[selector] = this.parseParts(inPlural, true);
      this.expect('}');
      this.skipSpaces();
    }

    if (!options.other) {
      this.fail("missing the 'other' option");
    }
    return options;
  }

  private match(pattern: RegExp, expected: string): string {
    pattern.lastIndex = this.index;
    const match = pattern.exec(this.message);
    if (!match) {
      return this.fail(`expected ${expected}`);
    }
    this.index = pattern.lastIndex;
    return match[0];
  }

  private consume(char: string): boolean {
    if (this.message[this.index] === char) {
      this.index++;
      return true;
    }
    return false;
  }

  private expect(char: string): void {
    if (!this.consume(char)) {
      this.fail(`expected '${char}'`);
    }
  }

  private skipSpaces(): void {
    while (/\s/.test(this.message[this.index] ?? '')) {
      this.index++;
    }
  }

  private raw(start: number): string {
    return this.message.slice(start, this.index);
  }

  private fail(reason: string): never {
    throw new Error(`Invalid message at position ${this.index}: ${reason}`);
  }
}
