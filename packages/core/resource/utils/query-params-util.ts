import { config, QueryMethod } from '@appweaver/common';
import { ErrorCode } from '@appweaver/common';
import { ResourceError } from '../resource-error';

/** The HTTP methods a query or aggregate route is registered for. */
export type QueryRouteMethods = { post: boolean; get: boolean };

/**
 * Resolves the HTTP methods of a query or aggregate route, falling back to the
 * `RESOURCE_QUERY_METHOD` or `RESOURCE_AGGREGATE_METHOD` config.
 *
 * @param {'query' | 'aggregate'} route The resource route to resolve.
 * @param {QueryMethod | string} [method] The method configured on the route.
 * @return {QueryRouteMethods} Whether the POST and the GET route are registered.
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

/** The bulk routes of a resource, each one enabled on its own. */
export type BulkRouteName = 'bulkCreate' | 'bulkUpdate' | 'bulkDelete';

/**
 * Tells whether the config enables a bulk route for every resource, through
 * the `RESOURCE_BULK_CREATE_ENABLED`, `RESOURCE_BULK_UPDATE_ENABLED`, or
 * `RESOURCE_BULK_DELETE_ENABLED` config.
 *
 * @param {BulkRouteName} route The bulk route to resolve.
 * @return {boolean} Whether the config enables the bulk route.
 */
export function bulkRouteEnabled(route: BulkRouteName): boolean {
  switch (route) {
    case 'bulkCreate':
      return config.RESOURCE_BULK_CREATE_ENABLED;
    case 'bulkUpdate':
      return config.RESOURCE_BULK_UPDATE_ENABLED;
    case 'bulkDelete':
      return config.RESOURCE_BULK_DELETE_ENABLED;
  }
}

/**
 * Parses the JSON-encoded properties of a querystring in place, before validation.
 *
 * @param {Record<string, unknown>} query The parsed querystring of the request.
 * @param {string[]} jsonFields The properties always given as JSON (i.e. `filter`).
 * @param {string[]} [objectFields] The properties parsed only when given as a JSON object (i.e. `sort`).
 * @throws {ResourceError} `RESOURCE_INVALID_QUERY_PARAMETER` if a property is repeated or holds malformed JSON.
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
      throw new ResourceError(
        ErrorCode.ResourceInvalidQueryParameter,
        `Query parameter '${field}' is repeated`,
        { parameter: field }
      );
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
      throw new ResourceError(
        ErrorCode.ResourceInvalidQueryParameter,
        `Query parameter '${field}' is not valid JSON`,
        { parameter: field },
        { cause: e }
      );
    }
  }
}
