import fastifyPlugin from 'fastify-plugin';
import { logger, PLUGIN } from '@appweaver/common';
import { define } from '../context';
import { Server } from '../types';

export function registerPlugin(
  name: string,
  plugin: (server: Server) => void,
  dependencies: string[] = []
): void {
  define(fastifyPlugin(plugin, { name, dependencies }), PLUGIN, 'append');

  logger.debug({ plugin: name, dependencies }, 'Registered plugin');
}
