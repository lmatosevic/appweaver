import { FastifyPluginCallback } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { createLogger, PLUGIN } from '@appweaver/common';
import { define } from '@appweaver/core';
import { Server } from '../types/server';

const logger = createLogger('server');

/** A registered plugin, as it is stored in the application context. */
export type PluginEntry = { plugin: FastifyPluginCallback };

/**
 * Registers a Fastify plugin, applied to the application server once it starts.
 *
 * @param {string} name - The unique name of the plugin, which other plugins can depend on.
 * @param {Function} plugin - The plugin function receiving the server.
 * @param {string[]} [dependencies=[]] - The names of the plugins this one depends on.
 */
export function registerPlugin(
  name: string,
  plugin: (server: Server) => void,
  dependencies: string[] = []
): void {
  // Wrapped in an object, since the context would instantiate a plugin
  // declared with the function keyword as a class
  const entry: PluginEntry = {
    plugin: fastifyPlugin(plugin, { name, dependencies })
  };
  define(entry, PLUGIN, 'append');

  logger.debug({ plugin: name, dependencies }, 'Registered plugin');
}
