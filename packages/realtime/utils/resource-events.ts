import {
  RealtimeAccess,
  ResourceEventAction,
  ResourceRoutesConfig
} from '@appweaver/common';
import { routeAccess } from '@appweaver/web';

/**
 * Reads the exposed actions of the resource events of a model, each with the access of the first of these setting any
 * of `public`, `roles` and `permissions`: its action object, the `events`, then the `find` route, since an event
 * delivers a record to its readers.
 *
 * @param {ResourceRoutesConfig} routes - The config of the resource routes, with their `events`.
 * @return {Map<ResourceEventAction, RealtimeAccess>} The access of every exposed action, in their order.
 */
export function resourceEventActions(
  routes: Omit<ResourceRoutesConfig, 'modelName'>
): Map<ResourceEventAction, RealtimeAccess> {
  const actions = new Map<ResourceEventAction, RealtimeAccess>();
  if (!routes.events) {
    return actions;
  }
  const defaults =
    [accessOf(routes.events), routeAccess('find', routes)].find(
      (access) => Object.keys(access).length > 0
    ) ?? {};

  for (const entry of routes.events.actions) {
    if (typeof entry === 'string') {
      actions.set(entry, defaults);
    } else {
      const own = accessOf(entry);
      actions.set(entry.action, Object.keys(own).length > 0 ? own : defaults);
    }
  }

  return actions;
}

function accessOf(config: RealtimeAccess): RealtimeAccess {
  const access: RealtimeAccess = {};
  if (config.public !== undefined) {
    access.public = config.public;
  }
  if (config.roles !== undefined) {
    access.roles = config.roles;
  }
  if (config.permissions !== undefined) {
    access.permissions = config.permissions;
  }
  return access;
}
