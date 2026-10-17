import { ErrorCode, RequestError, TemplateData } from '@appweaver/common';

/** The query parameter holding the locale to render a preview in. */
export const PREVIEW_LOCALE_PARAM = '_locale';

/** The query parameter holding the JSON of the data to render a preview with. */
export const PREVIEW_DATA_PARAM = '_data';

/** The highest index a dotted parameter name writes to a list, i.e. `items.0.name`. */
const MAX_LIST_INDEX = 999;

/** The keys never written, which would change the prototype of the data. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Builds the data of a template preview from the query parameters. The `_data` parameter holds a JSON object the other
 * parameters are merged over. A dotted parameter name sets a nested value, a numeric part of it an item of a list
 * (`order.items.0.name=Book`), and a repeated parameter a list of values. The values `true`, `false`, `null` and the
 * numbers written the way they print (`12`, `-0.5`, not `012`) are converted to their type, the other values are
 * strings.
 *
 * @param {Record<string, unknown>} query - The query parameters, except the `_locale` one.
 * @return {TemplateData} The data of the template.
 * @throws {RequestError} `MALFORMED_REQUEST` if the `_data` parameter is not a JSON object.
 */
export function previewData(query: Record<string, unknown>): TemplateData {
  const { [PREVIEW_DATA_PARAM]: json, ...params } = query;
  const data = parseJsonData(json);

  for (const [name, value] of Object.entries(params)) {
    setPath(
      data,
      name.split('.'),
      Array.isArray(value) ? value.map(toValue) : toValue(value)
    );
  }

  return data;
}

function parseJsonData(json: unknown): TemplateData {
  if (json === undefined) {
    return {};
  }

  let data: unknown;
  try {
    data = typeof json === 'string' ? JSON.parse(json) : undefined;
  } catch {
    data = undefined;
  }
  if (!isPlainObject(data)) {
    throw new RequestError(
      ErrorCode.MalformedRequest,
      `The '${PREVIEW_DATA_PARAM}' query parameter must be a JSON object`
    );
  }
  return data;
}

function isPlainObject(value: unknown): value is TemplateData {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function setPath(data: TemplateData, path: string[], value: unknown): void {
  if (path.some((key) => key === '' || UNSAFE_KEYS.has(key))) {
    return;
  }

  let target: Record<string, unknown> = data;
  for (const [i, key] of path.entries()) {
    // A list takes only its indexes
    if (Array.isArray(target) && listIndex(key) === undefined) {
      return;
    }
    if (i === path.length - 1) {
      target[key] = value;
      return;
    }

    const next = target[key];
    if (typeof next !== 'object' || next === null) {
      target[key] = listIndex(path[i + 1]) === undefined ? {} : [];
    }
    target = target[key] as Record<string, unknown>;
  }
}

function listIndex(key: string): number | undefined {
  if (!/^\d+$/.test(key)) {
    return undefined;
  }
  const index = Number(key);
  return index <= MAX_LIST_INDEX ? index : undefined;
}

function toValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  if (value === 'true' || value === 'false' || value === 'null') {
    return JSON.parse(value);
  }
  const number = Number(value);
  if (Number.isFinite(number) && String(number) === value) {
    return number;
  }
  return value;
}
