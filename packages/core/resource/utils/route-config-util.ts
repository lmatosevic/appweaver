import {
  BulkRouteConfig,
  QueryRouteConfig,
  ResourceRoutesConfig
} from '@appweaver/common';
import { BulkRouteName, bulkRouteEnabled } from './query-params-util';

/** The routes of a resource, each configurable on its own. */
export type ResourceRouteName =
  | 'find'
  | 'query'
  | 'aggregate'
  | 'create'
  | 'update'
  | 'replace'
  | 'delete'
  | 'export'
  | 'fileUpload'
  | 'fileDelete'
  | BulkRouteName;

/** The config of any resource route. */
export type ResourceRouteConfig = QueryRouteConfig &
  Pick<BulkRouteConfig, 'maxItems' | 'returnRecords'>;

const READ_ROUTES: ResourceRouteName[] = ['find', 'query', 'aggregate'];
const QUERY_ROUTES: ResourceRouteName[] = ['query', 'aggregate'];
const BULK_ROUTES: ResourceRouteName[] = [
  'bulkCreate',
  'bulkUpdate',
  'bulkReplace',
  'bulkDelete'
];
const CACHE_OPTIONS = ['cache', 'cacheTTL', 'cacheSkipInvalidation'] as const;

const isBulkRoute = (route: ResourceRouteName): route is BulkRouteName =>
  BULK_ROUTES.includes(route);

// The routes each route inherits its config from, the most generic one first
const ROUTE_PARENTS: Partial<Record<ResourceRouteName, ResourceRouteName[]>> = {
  replace: ['update'],
  bulkCreate: ['create'],
  bulkUpdate: ['update'],
  bulkReplace: ['update', 'replace', 'bulkUpdate'],
  bulkDelete: ['delete']
};

// Options that override each other (i.e. `public` ignores `roles`), so a route
// setting any of them inherits none of the group from the defaults
const OPTION_GROUPS: (keyof ResourceRouteConfig)[][] = [
  ['public', 'roles', 'permissions', 'auth'],
  ['recaptcha', 'recaptchaAction'],
  ['turnstile', 'turnstileAction']
];

/**
 * Merges the default config of a resource into the config of one of its
 * routes. The route options take precedence, and the defaults a route does not
 * support are skipped.
 *
 * @param {ResourceRouteName} routeName The route to build the config for.
 * @param {QueryRouteConfig} [defaults] The default config of the resource routes.
 * @param {ResourceRouteConfig} [config] The config of the route.
 * @return {ResourceRouteConfig} The merged route config.
 */
export function mergeRouteDefaults(
  routeName: ResourceRouteName,
  defaults: QueryRouteConfig = {},
  config: ResourceRouteConfig = {}
): ResourceRouteConfig {
  const own = Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined)
  ) as ResourceRouteConfig;
  const inherited: Partial<Record<keyof ResourceRouteConfig, unknown>> = {
    ...defaults
  };

  if (!READ_ROUTES.includes(routeName)) {
    CACHE_OPTIONS.forEach((option) => delete inherited[option]);
  }
  if (!QUERY_ROUTES.includes(routeName)) {
    delete inherited.method;
  }
  for (const group of OPTION_GROUPS) {
    if (group.some((option) => own[option] !== undefined)) {
      group.forEach((option) => delete inherited[option]);
    }
  }

  return { ...inherited, ...own } as ResourceRouteConfig;
}

/**
 * Resolves the config of a resource route, merging the defaults and the config
 * of each route it inherits from, then its own. The replace route inherits the
 * update route, a bulk route its single route, and the bulk replace route the
 * update, replace and bulk update routes, in that order.
 *
 * A bulk route is excluded unless its config switch enables it, which an
 * `exclude` option set on the bulk route, or on the bulk route it inherits,
 * overrides either way.
 *
 * @param {ResourceRouteName} routeName The route to resolve the config of.
 * @param {Object} [routesConfig={}] The config of the resource routes.
 * @return {ResourceRouteConfig} The resolved route config.
 */
export function resolveRouteConfig(
  routeName: ResourceRouteName,
  routesConfig: Omit<ResourceRoutesConfig, 'modelName' | 'path'> = {}
): ResourceRouteConfig {
  const chain = [...(ROUTE_PARENTS[routeName] ?? []), routeName];

  const config = chain.reduce<ResourceRouteConfig>(
    (defaults, name) => mergeRouteDefaults(name, defaults, routesConfig[name]),
    routesConfig.defaults ?? {}
  );

  if (isBulkRoute(routeName)) {
    const bulkExclude = chain
      .filter(isBulkRoute)
      .reverse()
      .map((name) => routesConfig[name]?.exclude)
      .find((exclude) => exclude !== undefined);

    config.exclude =
      bulkExclude ?? (config.exclude || !bulkRouteEnabled(routeName));
  }

  return config;
}
