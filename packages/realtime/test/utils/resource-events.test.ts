import { resourceEventActions } from '../../utils/resource-events';

describe('resource-events', () => {
  describe('resourceEventActions', () => {
    test('gives every action the access of the events', () => {
      expect(
        resourceEventActions({
          events: { actions: ['create', 'update'], roles: ['staff'] }
        })
      ).toEqual(
        new Map([
          ['create', { roles: ['staff'] }],
          ['update', { roles: ['staff'] }]
        ])
      );
    });

    test('replaces the access of the events with the one of an action', () => {
      expect(
        resourceEventActions({
          events: {
            actions: [
              'create',
              { action: 'update', public: true },
              { action: 'delete', permissions: ['products.delete'] }
            ],
            public: false,
            roles: ['staff']
          }
        })
      ).toEqual(
        new Map<string, object>([
          ['create', { public: false, roles: ['staff'] }],
          ['update', { public: true }],
          ['delete', { permissions: ['products.delete'] }]
        ])
      );
    });

    test('gives an action object without access the one of the events', () => {
      expect(
        resourceEventActions({
          events: { actions: [{ action: 'delete' }], public: true }
        })
      ).toEqual(new Map([['delete', { public: true }]]));
    });

    test('keeps the own access of an action object', () => {
      expect(
        resourceEventActions({
          events: {
            actions: [{ action: 'delete', roles: ['admin'], permissions: [] }]
          }
        })
      ).toEqual(new Map([['delete', { roles: ['admin'], permissions: [] }]]));
    });

    test('defaults to the access of the find route, else of the defaults of the routes', () => {
      const actions = ['create', 'update'] as const;

      expect(
        resourceEventActions({
          defaults: { roles: ['staff'] },
          find: { permissions: ['products.read'], exclude: true },
          create: { roles: ['admin'] },
          events: { actions: [...actions] }
        })
      ).toEqual(
        new Map([
          ['create', { permissions: ['products.read'] }],
          ['update', { permissions: ['products.read'] }]
        ])
      );
      expect(
        resourceEventActions({
          defaults: { public: true },
          events: { actions: [...actions] }
        })
      ).toEqual(
        new Map([
          ['create', { public: true }],
          ['update', { public: true }]
        ])
      );
    });

    test('overrides the access of the find route with the one of the events', () => {
      expect(
        resourceEventActions({
          defaults: { roles: ['staff'] },
          events: { actions: ['create'], public: true }
        })
      ).toEqual(new Map([['create', { public: true }]]));
    });

    test('exposes no action without events', () => {
      expect(resourceEventActions({ defaults: { public: true } })).toEqual(
        new Map()
      );
    });
  });
});
