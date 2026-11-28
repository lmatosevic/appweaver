import { context } from '@appweaver/core/internal';
import { resetContext } from '@appweaver/testing';
import { createRoutes } from '../../factory/create-routes';
import {
  applyRoutesExtensions,
  extendRoutes
} from '../../factory/extend-routes';

describe('extend-routes', () => {
  beforeEach(() => {
    resetContext();
  });

  afterAll(() => {
    resetContext();
  });

  describe('extendRoutes', () => {
    test('merges the config of the extension over the routes, option by option', () => {
      extendRoutes('Key', {
        defaults: { roles: ['Admin', 'User'] },
        find: { cache: true },
        mcp: { actions: ['find'] }
      });
      const routes = createRoutes({
        modelName: 'Key',
        defaults: { auth: ['jwt'], roles: ['Admin'] },
        find: { rateLimit: { max: 1 } },
        mcp: { actions: ['find', 'query'], description: 'Keys' }
      });
      const config = routes.config;

      applyRoutesExtensions();

      expect(context.resource.routes.get('Key')).toBe(routes);
      // The plugin of the routes reads this same object when the server starts
      expect(routes.config).toBe(config);
      expect(routes.config).toMatchObject({
        defaults: { auth: ['jwt'], roles: ['Admin', 'User'] },
        find: { rateLimit: { max: 1 }, cache: true },
        mcp: { actions: ['find'] }
      });
      expect(routes.config.mcp).not.toHaveProperty('description');
    });

    test('moves the routes to the path of the extension', () => {
      extendRoutes('Key', { path: '/keys' });
      const routes = createRoutes({ modelName: 'Key' });

      applyRoutesExtensions();

      expect(routes.basePath).toBe('/keys');
    });

    test('creates the routes of a model without any', () => {
      extendRoutes('Key', { defaults: { roles: ['Admin'] } });

      applyRoutesExtensions();

      expect(context.resource.routes.get('Key')?.config).toMatchObject({
        modelName: 'Key',
        defaults: { roles: ['Admin'] }
      });
    });
  });
});
