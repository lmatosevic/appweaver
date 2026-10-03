import { config, QueryMethod } from '@appweaver/common';
import { HttpError } from '../../errors';

/** The HTTP methods a query or aggregate route is registered for. */
export type QueryRouteMethods = { post: boolean; get: boolean };

/**
 * Resolves the HTTP methods of a query or aggregate route, falling back to the
 * `RESOURCE_QUERY_METHOD` or `RESOURCE_AGGREGATE_METHOD` config.
 *
 * @param {'query' | 'aggregate'} route The resource route to resolve.
 * @param {QueryMethod | string} [method] The method configured on the route.
 * @returns {QueryRouteMethods} Whether the POST and the GET route are registered.
 */
export function queryRouteMethods(
  route: 'query' | 'aggregate',
  method?: QueryMethod | `${QueryMethod}`
): QueryRouteMethods {
  const resolved =
    method ??
    (route === 'query'
      ? config.RESOURCE_QUERY_METHOD
      : config.RESOURCE_AGGREGATE_METHOD);

  return {
    post: resolved === QueryMethod.Post || resolved === QueryMethod.GetPost,
    get: resolved === QueryMethod.Get || resolved === QueryMethod.GetPost
  };
}

/**
 * Parses the JSON-encoded properties of a querystring in place, before validation.
 *
 * @param {Record<string, unknown>} query The parsed querystring of the request.
 * @param {string[]} jsonFields The properties always given as JSON (i.e. `filter`).
 * @param {string[]} [objectFields] The properties parsed only when given as a JSON object (i.e. `sort`).
 * @throws {HttpError} 400 if a property is repeated or holds malformed JSON.
 */
export function parseJsonParams(
  query: Record<string, unknown>,
  jsonFields: string[],
  objectFields: string[] = []
): void {
  for (const field of [...jsonFields, ...objectFields]) {
    const value = query[field];

    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      throw new HttpError(`Query parameter '${field}' is repeated`, 400);
    }

    if (
      typeof value !== 'string' ||
      (!jsonFields.includes(field) && !value.trimStart().startsWith('{'))
    ) {
      continue;
    }

    try {
      query[field] = JSON.parse(value);
    } catch (e) {
      throw new HttpError(
        `Query parameter '${field}' is not valid JSON`,
        400,
        e
      );
    }
  }
}
