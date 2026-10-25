import {
  findFilesByPattern,
  importModule,
  isResourceRoutes,
  createLogger,
  ModuleSetupContext
} from '@appweaver/common';
import { context } from '@appweaver/core/internal';
import { resourceConfig } from '@appweaver/data';

const logger = createLogger('resource');

/**
 * The setup of `@appweaver/web`: loads the resource routes of the application (`RESOURCE_ROUTES_PATTERN`), then the
 * `web` part of every module, and leaves out the routes of the models the application does not have.
 *
 * @param {ModuleSetupContext} setup - The setup context.
 */
export async function loadWebParts(setup: ModuleSetupContext): Promise<void> {
  if (setup.params.autoLoadResources !== false) {
    const routePattern =
      (setup.params.resourcePaths as { routePattern?: string } | undefined)
        ?.routePattern || resourceConfig.ROUTES_PATTERN;

    for (const filePath of await findFilesByPattern(
      routePattern,
      setup.scanPath
    )) {
      const { error } = await importModule(filePath);
      if (error) {
        logger.error(error, 'Resource path import error');
      }
    }
  }

  for (const module of setup.modules) {
    await module.web?.();
  }

  // The routes of a model left out of the application, i.e. of the API keys
  // without an auth model, have no model to serve
  for (const [name, routes] of context.resource.routes) {
    if (
      isResourceRoutes(routes) &&
      !context.resource.models.has(routes.config.modelName)
    ) {
      context.resource.routes.delete(name);
    }
  }
}
