import { TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { registerSchemaFormats } from '@appweaver/common';

/** The characters a partial JSON is trimmed by at most, looking for a prefix that completes into a valid value. */
const MAX_TRIM = 64;

/**
 * Parses the JSON of a model output: the whole text, or the first object or array in it, i.e. inside a Markdown code
 * block.
 *
 * @param {string} text - The output of the model.
 * @return {unknown} The parsed value.
 * @throws {SyntaxError} When the text holds no valid JSON.
 */
export function parseJsonOutput(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1];
    if (fenced !== undefined) {
      return JSON.parse(fenced.trim());
    }
    const start = trimmed.search(/[{[]/);
    const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw error;
  }
}

/**
 * Parses an incomplete JSON object or array, i.e. the output of a model while it streams, closing its open strings,
 * arrays and objects. A value cut in the middle of a key, a number or a literal is left out.
 *
 * @param {string} text - The JSON received so far.
 * @return {unknown} The value parsed so far, `undefined` before an object or an array starts.
 */
export function parsePartialJson(text: string): unknown {
  const start = text.search(/[{[]/);
  if (start < 0) {
    return undefined;
  }
  const source = text.slice(start);
  const shortest = Math.max(1, source.length - MAX_TRIM);
  for (let end = source.length; end >= shortest; end--) {
    const completed = completeJson(source.slice(0, end));
    if (completed === undefined) {
      continue;
    }
    try {
      return JSON.parse(completed);
    } catch {
      // A shorter prefix may complete into a valid value
    }
  }
  return undefined;
}

/**
 * Lists the errors of a value against a schema, each with its path, the string formats of `registerSchemaFormats`
 * checked.
 *
 * @param {TSchema} schema - The schema.
 * @param {unknown} value - The value.
 * @return {string[]} The first ten errors, empty for a valid value.
 */
export function schemaErrors(schema: TSchema, value: unknown): string[] {
  registerSchemaFormats();
  const errors: string[] = [];
  for (const error of Value.Errors(schema, value)) {
    errors.push(`${error.path || '/'}: ${error.message}`);
    if (errors.length === 10) {
      break;
    }
  }
  return errors;
}

/** Closes the open strings, arrays and objects of a JSON prefix, `undefined` for one ending where no value can. */
function completeJson(prefix: string): string | undefined {
  const closers: string[] = [];
  let inString = false;
  let escaped = false;
  for (const char of prefix) {
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === '{') {
      closers.push('}');
    } else if (char === '[') {
      closers.push(']');
    } else if (char === '}' || char === ']') {
      closers.pop();
    }
  }
  let completed = prefix;
  if (inString) {
    if (escaped) {
      completed = completed.slice(0, -1);
    }
    completed += '"';
  } else {
    completed = completed.trimEnd();
    if (/[,:]$/.test(completed)) {
      return undefined;
    }
  }
  return completed + closers.reverse().join('');
}
