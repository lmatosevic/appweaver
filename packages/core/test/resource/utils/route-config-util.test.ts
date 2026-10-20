import * as common from '@appweaver/common';
import {
  mergeRouteDefaults,
  resolveRouteConfig
} from '../../../resource/utils/route-config-util';

describe('route-config-util', () => {
  describe('mergeRouteDefaults', () => {
    test('applies the defaults to a route without config', () => {
      expect(
        mergeRouteDefaults('find', { roles: ['Admin'], cacheTTL: 5000 })
      ).toEqual({ roles: ['Admin'], cacheTTL: 5000 });
    });

    test('prefers the options the route sets', () => {
      expect(
        mergeRouteDefaults(
          'query',
          { cache: true, rateLimit: { max: 10 } },
          { cache: false }
        )
      ).toEqual({ cache: false, rateLimit: { max: 10 } });
    });

    test('replaces an object or array option as a whole', () => {
      expect(
        mergeRouteDefaults(
          'create',
          { rateLimit: { max: 10, timeWindow: '1 minute' }, roles: ['Admin'] },
          { rateLimit: { max: 2 }, roles: ['User'] }
        )
      ).toEqual({ rateLimit: { max: 2 }, roles: ['User'] });
    });

    test('ignores the route options left undefined', () => {
      expect(
        mergeRouteDefaults('find', { cacheTTL: 5000 }, { cacheTTL: undefined })
      ).toEqual({ cacheTTL: 5000 });
    });

    test('skips the cache defaults on the routes that do not cache', () => {
      const defaults = { cache: true, cacheTTL: 5000, roles: ['Admin'] };

      expect(mergeRouteDefaults('find', defaults)).toEqual(defaults);
      expect(mergeRouteDefaults('aggregate', defaults)).toEqual(defaults);
      for (const route of ['create', 'update', 'delete', 'export'] as const) {
        expect(mergeRouteDefaults(route, defaults)).toEqual({
          roles: ['Admin']
        });
      }
    });

    test('skips the method default on the routes other than query and aggregate', () => {
      expect(mergeRouteDefaults('query', { method: 'get' })).toEqual({
        method: 'get'
      });
      expect(mergeRouteDefaults('aggregate', { method: 'get' })).toEqual({
        method: 'get'
      });
      expect(mergeRouteDefaults('find', { method: 'get' })).toEqual({});
    });

    test('inherits no access default once the route sets an access option', () => {
      expect(
        mergeRouteDefaults(
          'create',
          { public: true, auth: ['jwt'], cacheTTL: 5000, rateLimit: false },
          { roles: ['Admin'] }
        )
      ).toEqual({ roles: ['Admin'], rateLimit: false });
    });

    test('inherits no reCAPTCHA default once the route sets a reCAPTCHA option', () => {
      expect(
        mergeRouteDefaults(
          'create',
          { recaptcha: true, recaptchaAction: 'create' },
          { recaptcha: false }
        )
      ).toEqual({ recaptcha: false });
    });

    test('inherits no Turnstile default once the route sets a Turnstile option', () => {
      expect(
        mergeRouteDefaults(
          'create',
          { turnstile: true, turnstileAction: 'create', recaptcha: true },
          { turnstileAction: 'signup' }
        )
      ).toEqual({ turnstileAction: 'signup', recaptcha: true });
    });

    test('excludes every route the defaults exclude, unless included again', () => {
      expect(mergeRouteDefaults('delete', { exclude: true })).toEqual({
        exclude: true
      });
      expect(
        mergeRouteDefaults('find', { exclude: true }, { exclude: false })
      ).toEqual({ exclude: false });
    });
  });

  describe('resolveRouteConfig', () => {
    afterEach(() => {
      delete (common as any).configOverrides.RESOURCE_BULK_UPDATE_ENABLED;
    });

    test('applies the defaults and the own config of a route', () => {
      expect(
        resolveRouteConfig('create', {
          defaults: { roles: ['User'], rateLimit: false },
          create: { roles: ['Admin'] }
        })
      ).toEqual({ roles: ['Admin'], rateLimit: false });
    });

    test('inherits the update config on the replace route', () => {
      const routesConfig = {
        update: { roles: ['Admin'], rateLimit: { max: 5 } }
      };

      expect(resolveRouteConfig('replace', routesConfig)).toEqual(
        routesConfig.update
      );
    });

    test('prefers the replace config over the update one', () => {
      const routesConfig = {
        update: { roles: ['User'], rateLimit: { max: 5 } },
        replace: { roles: ['Admin'] }
      };

      expect(resolveRouteConfig('replace', routesConfig)).toEqual({
        roles: ['Admin'],
        rateLimit: { max: 5 }
      });
      expect(resolveRouteConfig('update', routesConfig)).toEqual(
        routesConfig.update
      );
    });

    test('excludes the replace route along with the update one, unless included again', () => {
      expect(
        resolveRouteConfig('replace', { update: { exclude: true } }).exclude
      ).toBe(true);
      expect(
        resolveRouteConfig('replace', {
          update: { exclude: true },
          replace: { exclude: false }
        }).exclude
      ).toBe(false);
      expect(
        resolveRouteConfig('update', { replace: { exclude: true } }).exclude
      ).toBeUndefined();
    });

    test('inherits the update, replace and bulk update config, in that order, on the bulk replace route', () => {
      expect(
        resolveRouteConfig('bulkReplace', {
          update: { roles: ['User'], rateLimit: false },
          replace: { roles: ['Editor'], recaptcha: true },
          bulkUpdate: { exclude: false, maxItems: 10 },
          bulkReplace: { returnRecords: false }
        })
      ).toEqual({
        roles: ['Editor'],
        rateLimit: false,
        recaptcha: true,
        exclude: false,
        maxItems: 10,
        returnRecords: false
      });
      expect(
        resolveRouteConfig('bulkReplace', {
          replace: { roles: ['Editor'] },
          bulkUpdate: { exclude: false, roles: ['Admin'] }
        }).roles
      ).toEqual(['Admin']);
    });

    test('keeps the replace config off the bulk update route', () => {
      expect(
        resolveRouteConfig('bulkUpdate', {
          update: { roles: ['User'] },
          replace: { roles: ['Admin'] },
          bulkUpdate: { exclude: false }
        })
      ).toEqual({ roles: ['User'], exclude: false });
    });

    test('enables the bulk update and replace routes by the same config switch', () => {
      expect(resolveRouteConfig('bulkUpdate').exclude).toBe(true);
      expect(resolveRouteConfig('bulkReplace').exclude).toBe(true);

      (common as any).configOverrides.RESOURCE_BULK_UPDATE_ENABLED = true;

      expect(resolveRouteConfig('bulkUpdate').exclude).toBe(false);
      expect(resolveRouteConfig('bulkReplace').exclude).toBe(false);
    });

    test('prefers the exclude option of the bulk routes over the config switch', () => {
      expect(
        resolveRouteConfig('bulkReplace', { bulkUpdate: { exclude: false } })
          .exclude
      ).toBe(false);

      (common as any).configOverrides.RESOURCE_BULK_UPDATE_ENABLED = true;

      expect(
        resolveRouteConfig('bulkReplace', { bulkUpdate: { exclude: true } })
          .exclude
      ).toBe(true);
      expect(
        resolveRouteConfig('bulkReplace', {
          bulkUpdate: { exclude: true },
          bulkReplace: { exclude: false }
        }).exclude
      ).toBe(false);
      expect(
        resolveRouteConfig('bulkUpdate', { bulkReplace: { exclude: true } })
          .exclude
      ).toBe(false);
    });

    test('excludes the bulk replace route along with the replace one', () => {
      (common as any).configOverrides.RESOURCE_BULK_UPDATE_ENABLED = true;

      expect(
        resolveRouteConfig('bulkReplace', { replace: { exclude: true } })
          .exclude
      ).toBe(true);
      expect(
        resolveRouteConfig('bulkUpdate', { replace: { exclude: true } }).exclude
      ).toBe(false);
    });
  });
});
