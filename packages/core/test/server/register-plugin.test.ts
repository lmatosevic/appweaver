import Fastify from 'fastify';
import { PLUGIN } from '@appweaver/common';
import { injectAll } from '../../context';
import { PluginEntry, registerPlugin } from '../../server/register-plugin';
import { resetContext } from '../fixtures/context-fixture';

describe('register-plugin', () => {
  beforeEach(() => {
    resetContext();
  });

  afterAll(() => {
    resetContext();
  });

  describe('registerPlugin', () => {
    test('registers the plugin under the plugin token', () => {
      registerPlugin('first', async () => undefined);
      registerPlugin('second', async () => undefined);

      expect(injectAll<PluginEntry>(PLUGIN)).toHaveLength(2);
    });

    test('runs a plugin declared with the function keyword with the server', async () => {
      const servers: unknown[] = [];
      registerPlugin('legacy', function legacy(server: any) {
        servers.push(server);
        server.decorate('legacy', true);
        return Promise.resolve();
      });

      // Injecting must not call the plugin as a class constructor
      const entries = injectAll<PluginEntry>(PLUGIN);
      expect(servers).toHaveLength(0);

      const server = Fastify();
      for (const { plugin } of entries) {
        server.register(plugin);
      }
      await server.ready();

      expect(servers).toHaveLength(1);
      expect(server.hasDecorator('legacy')).toBe(true);
      await server.close();
    });
  });
});
