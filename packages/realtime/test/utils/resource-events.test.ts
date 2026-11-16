import { resourceEventActions } from '../../utils/resource-events';

describe('resource-events', () => {
  describe('resourceEventActions', () => {
    test('gives every action the access of the events', () => {
      expect(
        resourceEventActions({
          actions: ['create', 'update'],
          roles: ['staff']
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
          actions: [
            'create',
            { action: 'update', public: true },
            { action: 'delete', permissions: ['products.delete'] }
          ],
          public: false,
          roles: ['staff']
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
        resourceEventActions({ actions: [{ action: 'delete' }], public: true })
      ).toEqual(new Map([['delete', { public: true }]]));
    });

    test('keeps the own access of an action object', () => {
      expect(
        resourceEventActions({
          actions: [{ action: 'delete', roles: ['admin'], permissions: [] }]
        })
      ).toEqual(new Map([['delete', { roles: ['admin'], permissions: [] }]]));
    });
  });
});
