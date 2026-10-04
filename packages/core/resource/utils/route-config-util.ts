import { QueryRouteConfig } from '@appweaver/common';

/** The routes of a resource, each configurable on its own. */
export type ResourceRouteName =
  | 'find'
  | 'query'
  | 'aggregate'
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'fileUpload'
  | 'fileDelete';

const READ_ROUTES: ResourceRouteName[] = ['find', 'query', 'aggregate'];
const QUERY_ROUTES: ResourceRouteName[] = ['query', 'aggregate'];
const CACHE_OPTIONS = ['cache', 'cacheTTL', 'cacheSkipInvalidation'] as const;

// Options that override each other (i.e. `public` ignores `roles`), so a route
// setting any of them inherits none of the group from the defaults
const OPTION_GROUPS: (keyof QueryRouteConfig)[][] = [
  ['public', 'roles', 'permissions', 'auth'],
  ['recaptcha', 'recaptchaAction']
];

/**
 * Merges the default config of a resource into the config of one of its
 * routes. The route options take precedence, and the defaults a route does not
 * support are skipped.
 *
 * @param {ResourceRouteName} routeName The route to build the config for.
 * @param {QueryRouteConfig} [defaults] The default config of the resource routes.
 * @param {QueryRouteConfig} [config] The config of the route.
 * @returns {QueryRouteConfig} The merged route config.
 */
export function mergeRouteDefaults(
  routeName: ResourceRouteName,
  defaults: QueryRouteConfig = {},
  config: QueryRouteConfig = {}
): QueryRouteConfig {
  const own = Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined)
  ) as QueryRouteConfig;
  const inherited: Partial<Record<keyof QueryRouteConfig, unknown>> = {
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

  return { ...inherited, ...own } as QueryRouteConfig;
}
