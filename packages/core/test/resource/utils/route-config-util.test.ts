import { mergeRouteDefaults } from '../../../resource/utils/route-config-util';

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

    test('excludes every route the defaults exclude, unless included again', () => {
      expect(mergeRouteDefaults('delete', { exclude: true })).toEqual({
        exclude: true
      });
      expect(
        mergeRouteDefaults('find', { exclude: true }, { exclude: false })
      ).toEqual({ exclude: false });
    });
  });
});
