import { ResourceEventsConfig } from '@appweaver/common';
import { RealtimeAccess } from '../types';

/** An action of the resource events of a model. */
export type ResourceEventAction = 'create' | 'update' | 'delete';

/**
 * Reads the exposed actions of the resource events of a model, each with its access: the `public`, `roles` and
 * `permissions` of an action object when it sets any of them, otherwise the ones of the `events`.
 *
 * @param {ResourceEventsConfig} events - The `events` of the resource routes.
 * @return {Map<ResourceEventAction, RealtimeAccess>} The access of every exposed action, in their order.
 */
export function resourceEventActions(
  events: ResourceEventsConfig
): Map<ResourceEventAction, RealtimeAccess> {
  const defaults = accessOf(events);
  const actions = new Map<ResourceEventAction, RealtimeAccess>();

  for (const entry of events.actions) {
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
