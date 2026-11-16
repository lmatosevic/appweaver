import { Type } from '@sinclair/typebox';
import { configOverrides } from '@appweaver/common';
import { context } from '@appweaver/core/internal';
import { resetContext } from '@appweaver/testing';
import { createRealtimeAction } from '../../action';
import { createChannel } from '../../channel';
import { realtimeSpec } from '../../web/realtime-spec';

describe('realtime-spec', () => {
  beforeEach(() => {
    resetContext();
  });

  afterEach(() => {
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  describe('realtimeSpec', () => {
    test('describes the channels, the resources and the actions', () => {
      createChannel({
        name: 'order.shipped',
        description: 'An order is shipped',
        payload: Type.Object({ id: Type.Integer() }),
        params: Type.Object({ id: Type.Optional(Type.Integer()) }),
        roles: ['customer'],
        permissions: ['orders.read']
      });
      createChannel({
        name: 'news',
        payload: Type.Object({}),
        public: true,
        roles: ['ignored']
      });
      createRealtimeAction({
        name: 'chat.typing',
        description: 'Typing in a room',
        payload: Type.Object({ roomId: Type.Integer() }),
        response: Type.Boolean(),
        handler: () => true
      });
      createRealtimeAction({
        name: 'cursor',
        payload: Type.Object({}),
        handler: () => undefined
      });
      context.resource.routes.set('Post', {
        config: { modelName: 'Post', events: { actions: ['create'] } },
        basePath: 'posts',
        handler: () => undefined
      } as never);
      context.resource.routes.set('Comment', {
        config: { modelName: 'Comment' },
        basePath: 'comments',
        handler: () => undefined
      });

      expect(realtimeSpec()).toEqual({
        routePrefix: '/api/realtime',
        transports: ['sse', 'websocket'],
        anonymous: false,
        channels: [
          {
            name: 'order.shipped',
            description: 'An order is shipped',
            public: false,
            roles: ['customer'],
            permissions: ['orders.read'],
            payload: {
              type: 'object',
              properties: { id: { type: 'integer' } },
              required: ['id']
            },
            params: {
              type: 'object',
              properties: { id: { type: 'integer' } }
            }
          },
          {
            name: 'news',
            public: true,
            payload: { type: 'object', properties: {} }
          }
        ],
        resources: [
          {
            model: 'Post',
            channel: 'resource:Post',
            actions: ['create'],
            public: false
          }
        ],
        actions: [
          {
            name: 'chat.typing',
            description: 'Typing in a room',
            public: false,
            payload: {
              type: 'object',
              properties: { roomId: { type: 'integer' } },
              required: ['roomId']
            },
            response: { type: 'boolean' }
          },
          {
            name: 'cursor',
            public: false,
            payload: { type: 'object', properties: {} }
          }
        ]
      });
    });

    test('lists only the enabled transports', () => {
      configOverrides.REALTIME_SSE_ENABLED = false;
      configOverrides.REALTIME_ROUTE_PREFIX = '/live/';

      expect(realtimeSpec()).toMatchObject({
        routePrefix: '/api/live',
        transports: ['websocket']
      });
    });
  });
});
