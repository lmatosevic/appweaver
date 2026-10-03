import { FastifyPluginCallback } from 'fastify';
import fastifyPlugin from 'fastify-plugin';
import { logger, PLUGIN } from '@appweaver/common';
import { define } from '../context';
import { Server } from '../types';

/** A registered plugin, as it is stored in the application context. */
export type PluginEntry = { plugin: FastifyPluginCallback };

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
