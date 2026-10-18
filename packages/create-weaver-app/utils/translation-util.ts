/** A call of the `t` helper, as a mustache `{{t "key" a=b}}` or a subexpression `(t "key" a=b)`. */
const TRANSLATE_CALL = /\{\{t\s+"([^"]+)"([^}]*)\}\}|\(t\s+"([^"]+)"([^)]*)\)/g;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '`': '&#x60;',
  '=': '&#x3D;'
};

/**
 * Flattens nested translations into their dotted keys, i.e. `{ emails: { footer: 'x' } }` into `emails.footer`.
 *
 * @param {Record<string, unknown>} translations - The nested translations of a translation file.
 * @return {Record<string, string>} The messages keyed by their dotted keys.
 */
export function flattenTranslations(
  translations: Record<string, unknown>,
  prefix = ''
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(translations)) {
    if (value && typeof value === 'object') {
      Object.assign(
        result,
        flattenTranslations(value as never, `${prefix}${name}.`)
      );
    } else if (typeof value === 'string') {
      result[prefix + name] = value;
    }
  }
  return result;
}

/**
 * Replaces the `t` helper calls of a Handlebars template with their messages, so the template renders the same text
 * without the translation files. The arguments become expressions, a plural becomes an `if` chain of the `eq` helper.
 *
 * @param {string} source - The Handlebars template.
 * @param {Record<string, string>} translations - The messages keyed by their dotted keys.
 * @param {boolean} html - Whether the template escapes its output as HTML, so the inlined text is escaped too.
 * @return {string} The template without the `t` helper calls.
 * @throws {Error} If a key has no message, or the message uses an ICU syntax that cannot be inlined.
 */
export function inlineTranslations(
  source: string,
  translations: Record<string, string>,
  html: boolean
): string {
  return source.replace(
    TRANSLATE_CALL,
    (_, key?: string, hash?: string, subKey?: string, subHash?: string) => {
      const name = (key ?? subKey)!;
      const message = translations[name];
      if (message === undefined) {
        throw new Error(`Translation '${name}' not found`);
      }

      const params = parseHash(key !== undefined ? hash! : subHash!);
      if (key !== undefined) {
        const escape = html ? escapeHtml : (text: string) => text;
        return compileMessage(message, params, escape, name);
      }

      // A subexpression is a value, so the message must be plain text
      if (/[{}"]/.test(message)) {
        throw new Error(
          `Translation '${name}' cannot be inlined into a subexpression`
        );
      }
      return `"${message.replace(/''/g, "'")}"`;
    }
  );
}

/** Parses the hash arguments of a helper call, i.e. ` count=expiresInMinutes`. */
function parseHash(hash: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [, name, value] of hash.matchAll(/(\w+)=("[^"]*"|\S+)/g)) {
    params[name] = value;
  }
  return params;
}

/** Compiles an ICU message into Handlebars, `#` writing the number of the enclosing plural. */
function compileMessage(
  message: string,
  params: Record<string, string>,
  escape: (text: string) => string,
  key: string,
  pound?: string
): string {
  let result = '';
  for (let i = 0; i < message.length; i++) {
    const char = message[i];
    if (char === "'" && message[i + 1] === "'") {
      result += escape("'");
      i++;
    } else if (char === '#' && pound) {
      result += `{{${pound}}}`;
    } else if (char === '{') {
      const end = closingBrace(message, i, key);
      result += compileArgument(message.slice(i + 1, end), params, escape, key);
      i = end;
    } else {
      result += escape(char);
    }
  }
  return result;
}

/** Compiles a simple `{name}` argument or a `{name, plural, ...}` one. */
function compileArgument(
  body: string,
  params: Record<string, string>,
  escape: (text: string) => string,
  key: string
): string {
  const [name, type, ...rest] = body.split(',');
  const value = params[name.trim()];
  if (value === undefined) {
    throw new Error(`Translation '${key}' has no parameter '${name.trim()}'`);
  }

  if (type === undefined) {
    return value.startsWith('"') ? escape(value.slice(1, -1)) : `{{${value}}}`;
  }
  if (type.trim() !== 'plural' || value.startsWith('"')) {
    throw new Error(
      `Translation '${key}' has an argument that cannot be inlined`
    );
  }

  const options = rest.join(',');
  const branches: { selector: string; message: string }[] = [];
  let i = 0;
  while (i < options.length) {
    const match = /^\s*(=\d+|[a-z]+)\s*\{/.exec(options.slice(i));
    if (!match) {
      break;
    }
    const start = i + match[0].length - 1;
    const end = closingBrace(options, start, key);
    branches.push({
      selector: match[1],
      message: compileMessage(
        options.slice(start + 1, end),
        params,
        escape,
        key,
        value
      )
    });
    i = end + 1;
  }

  // An exact value wins over the English `one` category, then `other`
  const conditions = [
    ...branches
      .filter((b) => b.selector.startsWith('='))
      .map((b) => ({ value: b.selector.slice(1), message: b.message })),
    ...branches
      .filter((b) => b.selector === 'one')
      .map((b) => ({ value: '1', message: b.message }))
  ];
  const other = branches.find((b) => b.selector === 'other');
  if (!other) {
    throw new Error(`Translation '${key}' has a plural without 'other'`);
  }

  return (
    conditions
      .map(
        (c, index) =>
          `{{${index === 0 ? '#if' : 'else if'} (eq ${value} ${c.value})}}${c.message}`
      )
      .join('') +
    (conditions.length ? `{{else}}${other.message}{{/if}}` : other.message)
  );
}

/** Returns the index of the brace closing the one at the start index. */
function closingBrace(text: string, start: number, key: string): number {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') {
      depth++;
    } else if (text[i] === '}' && --depth === 0) {
      return i;
    }
  }
  throw new Error(`Translation '${key}' has an unclosed brace`);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"'`=]/g, (char) => HTML_ESCAPES[char]);
}
