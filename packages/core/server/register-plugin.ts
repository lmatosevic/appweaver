import fastifyPlugin from 'fastify-plugin';
import { define } from '../context';
import { PLUGIN } from '../constants';
import { Server } from '../types';

export function registerPlugin(
  name: string,
  plugin: (server: Server) => void,
  dependencies: string[] = []
): void {
  define(fastifyPlugin(plugin, { name, dependencies }), PLUGIN, 'append');
}
