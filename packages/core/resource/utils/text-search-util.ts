import { isArray, isPlainObject, isString } from '@appweaver/common';

/** The placeholder a text search object marks the searched text with. */
export const TEXT_SEARCH_PLACEHOLDER = '{input}';

/**
 * Builds the database filter of a text search object for the searched text,
 * replacing every placeholder occurrence in its string values (i.e.
 * `'{input}'`) with the text. An `OR` given as an object is turned into the
 * list the database expects, each entry becoming one condition, the way the
 * `_or` operator of a query filter reads it.
 *
 * @param {Object} template The text search object configured on the service.
 * @param {string} input The searched text.
 * @returns {Object} A new filter object, the template is left untouched.
 */
export function bindTextSearch(template: any, input: string): any {
  if (isString(template)) {
    return template.replaceAll(TEXT_SEARCH_PLACEHOLDER, input);
  }

  if (isArray(template)) {
    return template.map((item) => bindTextSearch(item, input));
  }

  if (!isPlainObject(template)) {
    return template;
  }

  const bound: Record<string, any> = {};
  for (const [key, value] of Object.entries(template)) {
    bound[key] =
      key === 'OR' && isPlainObject(value)
        ? Object.entries(value).map(([field, condition]) => ({
            [field]: bindTextSearch(condition, input)
          }))
        : bindTextSearch(value, input);
  }

  return bound;
}
