// The auth model of the user change tests, its users kept in a map
let mockAuthModel: string | undefined;
const mockUsers = new Map<number, object>();
jest.mock('@appweaver/data', () => {
  const actual = jest.requireActual('@appweaver/data');
  const common = jest.requireActual('@appweaver/common');
  return {
    ...actual,
    resourceAuthService: () =>
      mockAuthModel
        ? {
            modelName: mockAuthModel,
            find: async (id: number) => {
              if (!mockUsers.has(id)) {
                throw new common.ResourceError(
                  common.ErrorCode.ResourceNotFound,
                  'Not found',
                  { model: 'User', id }
                );
              }
              return mockUsers.get(id);
            }
          }
        : undefined
  };
});

import { Type } from '@sinclair/typebox';
import { configOverrides, ErrorCode, Events, PubSub } from '@appweaver/common';
import { currentAuthUser, define, inject } from '@appweaver/core';
import { MemoryPubSub, NodeEvents } from '@appweaver/core/drivers';
import { context } from '@appweaver/core/internal';
import {
  recordTelemetry,
  resetContext,
  TelemetryRecorder
} from '@appweaver/testing';
import { createRealtimeAction } from '../../action';
import { createChannel } from '../../channel';
import { RealtimeGateway } from '../../gateway/realtime-gateway';
import { createStream } from '../../stream/create-stream';
import { StreamHub } from '../../stream/stream-hub';
import { streamSettings } from '../../stream/stream-instance';
import { RealtimeCloseCode } from '../../types';
import { FakeConnection } from '../fixtures/fake-connection';
import { FakeSink } from '../fixtures/fake-sink';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('RealtimeGateway', () => {
  let pubsub: MemoryPubSub;
  let gateway: RealtimeGateway;

  beforeEach(() => {
    resetContext();
    pubsub = new MemoryPubSub();
    define(pubsub, PubSub);
    define(new NodeEvents(), Events);
    gateway = new RealtimeGateway();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await gateway.onDestroy();
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  describe('open', () => {
    test('limits the connections of the instance', () => {
      configOverrides.REALTIME_MAX_CONNECTIONS = 1;
      gateway.open(new FakeConnection());

      expect(() => gateway.open(new FakeConnection({ id: 2 }))).toThrow(
        expect.objectContaining({
          code: ErrorCode.RealtimeConnectionLimit,
          details: { limit: 1 }
        })
      );
    });

    test('limits the anonymous connections of an IP address', () => {
      configOverrides.REALTIME_MAX_ANONYMOUS_CONNECTIONS_PER_IP = 1;
      const anonymous = (ip: string) => {
        const connection = new FakeConnection(null);
        connection.ip = ip;
        return connection;
      };
      gateway.open(anonymous('10.0.0.1'));
      gateway.open(anonymous('10.0.0.2'));

      expect(() => gateway.open(anonymous('10.0.0.1'))).toThrow(
        expect.objectContaining({
          code: ErrorCode.RealtimeConnectionLimit,
          details: { limit: 1 }
        })
      );
    });

    test('opens anonymous connections beside the user limit', () => {
      configOverrides.REALTIME_MAX_CONNECTIONS_PER_USER = 1;
      gateway.open(new FakeConnection(null));
      gateway.open(new FakeConnection(null));

      expect(gateway.connections.size).toBe(2);
    });

    test('sends the heartbeats while a connection is open', async () => {
      configOverrides.REALTIME_HEARTBEAT_INTERVAL = 1000;
      jest.useFakeTimers();
      const connection = new FakeConnection();
      gateway.open(connection);

      jest.advanceTimersByTime(2100);
      await gateway.release(connection);
      jest.advanceTimersByTime(2000);

      expect(connection.heartbeats).toHaveLength(2);
    });

    test('closes a connection at its maximum age', () => {
      configOverrides.REALTIME_CONNECTION_MAX_AGE = 1000;
      jest.useFakeTimers();
      const connection = new FakeConnection(undefined, Date.now() + 5000);
      gateway.open(connection);

      jest.advanceTimersByTime(1000);

      expect(connection.messages.at(-1)).toEqual({ type: 'reauth' });
      expect(connection.closedWith?.[0]).toBe(RealtimeCloseCode.Reauthenticate);
      expect(gateway.connections.size).toBe(0);
    });

    test('keeps a connection without a maximum age or an expiry', () => {
      configOverrides.REALTIME_CONNECTION_MAX_AGE = 0;
      const connection = new FakeConnection();
      gateway.open(connection);

      expect(connection.messages[0]).toMatchObject({
        type: 'welcome',
        expiresAt: null
      });
    });
  });

  describe('release', () => {
    test('ignores a connection already released', async () => {
      const connection = new FakeConnection();
      gateway.open(connection);

      await gateway.release(connection);
      await gateway.release(connection);

      expect(gateway.connections.size).toBe(0);
    });

    test('unsubscribes the pub/sub once no subscription is left', async () => {
      createChannel({ name: 'news', payload: Type.Object({}) });
      const unsubscribe = jest.spyOn(pubsub, 'unsubscribe');
      const first = new FakeConnection();
      const second = new FakeConnection({ id: 2 });
      gateway.open(first);
      gateway.open(second);
      await gateway.subscribe(first, { id: 'a', channel: 'news' });
      await gateway.subscribe(second, { id: 'a', channel: 'news' });

      await gateway.release(first);
      expect(unsubscribe).not.toHaveBeenCalled();
      await gateway.release(second);
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    test('logs a failed unsubscribe of the pub/sub', async () => {
      createChannel({ name: 'news', payload: Type.Object({}) });
      jest.spyOn(pubsub, 'unsubscribe').mockRejectedValue(new Error('down'));
      const connection = new FakeConnection();
      gateway.open(connection);
      await gateway.subscribe(connection, { id: 'a', channel: 'news' });

      await expect(gateway.release(connection)).resolves.toBeUndefined();
    });
  });

  describe('subscribe', () => {
    test('fails when the pub/sub subscription fails', async () => {
      createChannel({ name: 'news', payload: Type.Object({}) });
      jest.spyOn(pubsub, 'subscribe').mockRejectedValue(new Error('down'));
      const connection = new FakeConnection();
      gateway.open(connection);

      await expect(
        gateway.subscribe(connection, { id: 'a', channel: 'news' })
      ).rejects.toThrow('down');
      expect(connection.subscriptions.size).toBe(0);
    });

    test.each([
      [{ id: 'a', channel: 'news', params: [] }],
      [{ id: 'a', channel: 'news', filter: 'x' }],
      [{ id: 'a', channel: 1 }],
      [null]
    ])('refuses the invalid subscription %j', async (request) => {
      const connection = new FakeConnection();

      await expect(
        gateway.subscribe(connection, request as never)
      ).rejects.toMatchObject({ code: ErrorCode.RealtimeMessageInvalid });
    });

    test('removes nothing for an unknown subscription', async () => {
      await expect(
        gateway.unsubscribe(new FakeConnection(), 'missing')
      ).resolves.toBe(false);
    });
  });

  describe('delivery', () => {
    test('closes a connection reading too slowly', async () => {
      configOverrides.REALTIME_SEND_BUFFER_LIMIT = '1KB';
      const news = createChannel({ name: 'news', payload: Type.Object({}) });
      const connection = new FakeConnection();
      gateway.open(connection);
      await gateway.subscribe(connection, { id: 'a', channel: 'news' });
      connection.buffered = 2048;

      await news.publish({});
      await wait(20);

      expect(connection.closedWith?.[0]).toBe(RealtimeCloseCode.TooSlow);
      expect(gateway.connections.size).toBe(0);
    });

    test('skips a closed connection and a failed delivery check', async () => {
      const news = createChannel({
        name: 'news',
        payload: Type.Object({ n: Type.Integer() }),
        deliver: (_, payload) => {
          if (payload.n === 2) {
            throw new Error('broken');
          }
          return true;
        }
      });
      const connection = new FakeConnection();
      gateway.open(connection);
      await gateway.subscribe(connection, { id: 'a', channel: 'news' });

      await news.publish({ n: 2 });
      await wait(20);
      connection.closed = true;
      await news.publish({ n: 1 });
      await wait(20);

      expect(connection.messages.filter((m) => m.type === 'event')).toEqual([]);
    });

    test('denies a resource event of a model without a service', async () => {
      context.resource.routes.set('Post', {
        config: { modelName: 'Post', events: { actions: ['create'] } },
        basePath: 'posts',
        handler: () => undefined
      } as never);
      context.resource.models.set('Post', {} as never);
      await gateway.onReady();
      await gateway.onReady();
      const connection = new FakeConnection();
      gateway.open(connection);
      await gateway.subscribe(connection, {
        id: 'a',
        channel: 'resource:Post'
      });

      inject(Events).emitResourceEvent('Post', 'create', {
        current: { id: 1 }
      });
      await wait(20);

      expect(connection.messages.filter((m) => m.type === 'event')).toEqual([]);
    });

    test('logs a failed publish of a resource event', async () => {
      context.resource.routes.set('Post', {
        config: { modelName: 'Post', events: { actions: ['create'] } },
        basePath: 'posts',
        handler: () => undefined
      } as never);
      jest.spyOn(pubsub, 'publish').mockRejectedValue(new Error('down'));
      await gateway.onReady();

      expect(() =>
        inject(Events).emitResourceEvent('Post', 'create', {
          current: { id: 1 }
        })
      ).not.toThrow();
    });
  });

  describe('user changes', () => {
    const user = (overrides = {}) => ({
      id: 1,
      email: 'u@test.com',
      enabled: true,
      logoutAt: null,
      roles: [{ id: 1, name: 'user', permissions: [] }],
      ...overrides
    });
    const admin = { roles: [{ id: 2, name: 'admin', permissions: [] }] };

    beforeEach(async () => {
      mockAuthModel = 'User';
      mockUsers.clear();
      await gateway.onReady();
    });

    afterEach(() => {
      mockAuthModel = undefined;
    });

    const openOf = (connectionUser: ReturnType<typeof user>) => {
      const connection = new FakeConnection(connectionUser);
      gateway.open(connection);
      return connection;
    };

    test.each([
      ['a logout', { logoutAt: new Date('2026-01-01T00:00:00.000Z') }],
      ['a disabling', { enabled: false }]
    ])('closes the connections of a user after %s', async (_, change) => {
      const revoked = openOf(user());
      const kept = openOf(user({ id: 2 }));

      inject(Events).emitResourceEvent('User', 'update', {
        previous: user(),
        current: user(change)
      });
      await wait(20);

      expect(revoked.messages.at(-1)).toEqual({ type: 'reauth' });
      expect(revoked.closedWith?.[0]).toBe(RealtimeCloseCode.Reauthenticate);
      expect(kept.closed).toBe(false);
      expect(gateway.connections.size).toBe(1);
    });

    test('closes the connections of a deleted user', async () => {
      const revoked = openOf(user());

      inject(Events).emitResourceEvent('User', 'delete', { current: user() });
      await wait(20);

      expect(revoked.closedWith?.[0]).toBe(RealtimeCloseCode.Reauthenticate);
    });

    test('reloads the user and checks the subscriptions again', async () => {
      createChannel({
        name: 'admins',
        payload: Type.Object({}),
        roles: ['admin']
      });
      createChannel({ name: 'news', payload: Type.Object({}) });
      context.resource.models.set('Post', {} as never);
      context.resource.routes.set('Post', {
        config: {
          modelName: 'Post',
          events: {
            actions: [{ action: 'create', roles: ['admin'] }, 'update']
          }
        },
        basePath: 'posts',
        handler: () => undefined
      } as never);
      const connection = openOf(user(admin));
      for (const [id, channel] of [
        ['a', 'admins'],
        ['n', 'news'],
        ['p', 'resource:Post']
      ]) {
        await gateway.subscribe(connection, { id, channel });
      }
      mockUsers.set(1, user());

      inject(Events).emitResourceEvent('User', 'update', {
        previous: user(admin),
        current: user()
      });
      await wait(20);

      expect(connection.closed).toBe(false);
      expect(connection.user).toEqual(user());
      expect([...connection.subscriptions.keys()]).toEqual(['n', 'p']);
      const posts = connection.subscriptions.get('p')!;
      expect(posts.kind === 'resource' && [...posts.actions]).toEqual([
        'update'
      ]);
      expect(connection.messages.at(-1)).toMatchObject({
        type: 'error',
        id: 'a',
        error: { code: 'REALTIME_SUBSCRIPTION_DENIED' }
      });
    });

    test.each([
      ['deleted', undefined],
      ['disabled', user({ enabled: false })]
    ])(
      'closes the connections of a user found %s on a refresh',
      async (_, stored) => {
        const connection = openOf(user());
        if (stored) {
          mockUsers.set(1, stored);
        }

        await gateway.refresh(1);
        await wait(20);

        expect(connection.closedWith?.[0]).toBe(
          RealtimeCloseCode.Reauthenticate
        );
      }
    );

    test('leaves the connections of the other users', async () => {
      const other = openOf(user({ id: 2 }));

      await gateway.refresh(1);
      await wait(20);

      expect(other.closed).toBe(false);
      expect(other.user).toEqual(user({ id: 2 }));
    });

    test('applies a revoke of another instance', async () => {
      const revoked = openOf(user());
      const other = new RealtimeGateway();

      await other.revoke(1);
      await wait(20);

      expect(revoked.closedWith?.[0]).toBe(RealtimeCloseCode.Reauthenticate);
    });

    test('logs a failed publish', async () => {
      jest.spyOn(pubsub, 'publish').mockRejectedValue(new Error('down'));

      expect(() =>
        inject(Events).emitResourceEvent('User', 'delete', { current: user() })
      ).not.toThrow();
      await wait(20);
    });

    test('watches the auth users once', async () => {
      const subscribe = jest.spyOn(pubsub, 'subscribe');

      await gateway.onReady();

      expect(subscribe).not.toHaveBeenCalled();
    });
  });

  describe('user changes without an auth model', () => {
    test('keeps the connections on a refresh', async () => {
      const connection = new FakeConnection();
      gateway.open(connection);
      mockAuthModel = 'User';
      await gateway.onReady();
      mockAuthModel = undefined;

      await gateway.refresh(1);
      await wait(20);

      expect(connection.closed).toBe(false);
    });
  });

  describe('callAction', () => {
    let telemetry: TelemetryRecorder;

    beforeEach(() => {
      telemetry = recordTelemetry();
    });

    afterEach(async () => {
      await telemetry.stop();
    });

    test('traces the action and measures the connections', async () => {
      createRealtimeAction({
        name: 'ping',
        payload: Type.Object({}),
        public: true,
        handler: () => 'pong'
      });
      const connection = new FakeConnection(null);
      gateway.open(connection);

      await expect(
        gateway.callAction(
          'ping',
          {},
          { user: null, transport: 'http', ack: true }
        )
      ).resolves.toBe('pong');
      await gateway.handleMessage(
        connection,
        JSON.stringify({ type: 'action', id: '1', action: 'ping', payload: {} })
      );

      expect(telemetry.span('realtime action ping').attributes).toMatchObject({
        'appweaver.realtime.action': 'ping',
        'appweaver.realtime.transport': 'http'
      });
      expect(
        (await telemetry.metric('appweaver.realtime.connections'))
          ?.dataPoints[0].value
      ).toBe(1);
      expect(
        (await telemetry.metric('appweaver.realtime.messages'))?.dataPoints[0]
          .attributes
      ).toEqual({
        'appweaver.realtime.message': 'action',
        'appweaver.realtime.ack': true
      });
    });

    test('calls the action untraced with the instrumentation off', async () => {
      configOverrides.TELEMETRY_INSTRUMENTATIONS_REALTIME = false;
      createRealtimeAction({
        name: 'ping',
        payload: Type.Object({}),
        public: true,
        handler: () => 'pong'
      });

      await gateway.callAction(
        'ping',
        {},
        {
          user: null,
          transport: 'http',
          ack: true
        }
      );

      expect(telemetry.spans()).toEqual([]);
    });
  });

  describe('handleMessage', () => {
    test('answers nothing to a failed fire-and-forget action', async () => {
      const connection = new FakeConnection();
      gateway.open(connection);

      await gateway.handleMessage(
        connection,
        JSON.stringify({ type: 'action', action: 'missing' })
      );
      await gateway.handleMessage(connection, JSON.stringify({ type: 'ping' }));

      expect(connection.messages.slice(1)).toEqual([{ type: 'pong' }]);
    });

    test('answers an action without a name', async () => {
      const connection = new FakeConnection();

      await gateway.handleMessage(
        connection,
        JSON.stringify({ type: 'action', id: '1', action: 1 })
      );

      expect(connection.messages[0]).toMatchObject({
        type: 'error',
        id: '1',
        error: { code: 'REALTIME_MESSAGE_INVALID' }
      });
    });

    test('answers a result of nothing with null', async () => {
      createRealtimeAction({
        name: 'void',
        payload: Type.Object({}),
        handler: () => undefined
      });
      const connection = new FakeConnection();

      await gateway.handleMessage(
        connection,
        JSON.stringify({ type: 'action', id: '1', action: 'void', payload: {} })
      );

      expect(connection.messages[0]).toEqual({
        type: 'result',
        id: '1',
        result: null
      });
    });

    test('keeps the subscriptions after a failed one', async () => {
      createChannel({ name: 'news', payload: Type.Object({}) });
      const connection = new FakeConnection();
      gateway.open(connection);

      await Promise.all([
        gateway.handleMessage(
          connection,
          JSON.stringify({ type: 'subscribe', id: 'x', channel: 'missing' })
        ),
        gateway.handleMessage(
          connection,
          JSON.stringify({ type: 'subscribe', id: 'n', channel: 'news' })
        ),
        gateway.handleMessage(
          connection,
          JSON.stringify({ type: 'unsubscribe', id: 'missing' })
        )
      ]);

      expect(connection.messages.slice(1).map((m) => m.type)).toEqual([
        'error',
        'subscribed',
        'unsubscribed'
      ]);
    });
  });

  describe('streams', () => {
    let hub: StreamHub;

    const send = (connection: FakeConnection, message: object) =>
      gateway.handleMessage(connection, JSON.stringify(message));

    const types = (connection: FakeConnection) =>
      connection.messages.slice(1).map((message) => message.type);

    beforeEach(async () => {
      hub = new StreamHub();
      define(hub, StreamHub);
      await hub.onReady();
    });

    afterEach(async () => {
      await hub.onDestroy();
    });

    describe('subscriptions', () => {
      test('sends the streams of a key to its subscribers', async () => {
        const answer = createStream({
          name: 'answer',
          params: Type.Object({ roomId: Type.Integer() }),
          subscribe: (_, { roomId }, key) => key === `room-${roomId}`
        });
        const connection = new FakeConnection();
        gateway.open(connection);

        await send(connection, {
          type: 'subscribe',
          id: 's',
          channel: 'stream:answer',
          key: 'room-1',
          params: { roomId: 1 }
        });
        const writer = answer.open('room-1');
        writer.write('Hi');
        writer.end();

        expect(connection.messages.slice(1)).toEqual([
          { type: 'subscribed', id: 's' },
          {
            type: 'stream.start',
            id: 's',
            sid: expect.any(Number),
            streamId: writer.streamId,
            stream: 'answer',
            key: 'room-1',
            codec: 'text',
            seq: 0
          },
          { type: 'chunk', sid: expect.any(Number), seq: 0, data: 'Hi' },
          { type: 'stream.end', sid: expect.any(Number), seq: 1 }
        ]);
        // The subscription waits for the next streams of the key
        expect(connection.subscriptions.has('s')).toBe(true);

        await send(connection, { type: 'unsubscribe', id: 's' });
        answer.open('room-1').write('ignored');
        expect(types(connection).at(-1)).toBe('unsubscribed');
      });

      test('resumes a stream of a key', async () => {
        const answer = createStream({ name: 'answer' });
        const writer = answer.open('');
        writer.write('a');
        writer.write('b');
        const connection = new FakeConnection();
        gateway.open(connection);

        await gateway.subscribe(connection, {
          id: 's',
          channel: 'stream:answer',
          resume: { streamId: writer.streamId, seq: 1 }
        });

        expect(connection.messages.at(-1)).toMatchObject({
          type: 'chunk',
          data: 'b'
        });
        expect(
          connection.messages.filter((message) => message.type === 'chunk')
        ).toHaveLength(1);
      });

      test.each([
        [
          'an unknown stream',
          { channel: 'stream:missing' },
          'REALTIME_CHANNEL_UNKNOWN'
        ],
        [
          'a key too long',
          { key: 'k'.repeat(257) },
          'REALTIME_MESSAGE_INVALID'
        ],
        ['a key of another type', { key: 1 }, 'REALTIME_MESSAGE_INVALID'],
        [
          'an invalid resume',
          { resume: { streamId: 's', seq: -1 } },
          'REALTIME_MESSAGE_INVALID'
        ],
        [
          'a resume of another type',
          { resume: 'x' },
          'REALTIME_MESSAGE_INVALID'
        ],
        [
          'invalid params',
          { params: { roomId: 'x' } },
          'REALTIME_PAYLOAD_INVALID'
        ],
        [
          'a denied subscription',
          { params: { roomId: 2 } },
          'REALTIME_SUBSCRIPTION_DENIED'
        ]
      ])('refuses %s', async (_, request, code) => {
        createStream({
          name: 'answer',
          params: Type.Object({ roomId: Type.Integer() }),
          subscribe: (_, { roomId }) => roomId === 1
        });
        const connection = new FakeConnection();
        gateway.open(connection);

        await send(connection, {
          type: 'subscribe',
          id: 's',
          channel: 'stream:answer',
          params: { roomId: 1 },
          ...request
        });

        expect(connection.messages.at(-1)).toMatchObject({
          type: 'error',
          id: 's',
          error: { code }
        });
      });

      test('refuses a subscription without the roles of the stream', async () => {
        createStream({ name: 'admins', roles: ['admin'] });
        const connection = new FakeConnection();
        gateway.open(connection);

        await expect(
          gateway.subscribe(connection, { id: 's', channel: 'stream:admins' })
        ).rejects.toMatchObject({ code: ErrorCode.RealtimeSubscriptionDenied });
      });

      test('closes a connection reading a stream too slowly', async () => {
        const answer = createStream({ name: 'answer' });
        const connection = new FakeConnection();
        gateway.open(connection);
        await gateway.subscribe(connection, {
          id: 's',
          channel: 'stream:answer'
        });

        connection.buffered = 2 * 1024 * 1024;
        answer.open('').write('a');
        await wait(10);

        expect(connection.closedWith?.[0]).toBe(RealtimeCloseCode.TooSlow);
        expect(gateway.connections.size).toBe(0);
      });

      test('checks the stream subscriptions again when the user changes', async () => {
        mockAuthModel = 'User';
        mockUsers.clear();
        await gateway.onReady();
        createStream({ name: 'admins', roles: ['admin'] });
        createStream({ name: 'news' });
        const admin = {
          id: 1,
          email: 'u@test.com',
          enabled: true,
          roles: [{ id: 2, name: 'admin', permissions: [] }]
        };
        const connection = new FakeConnection(admin);
        gateway.open(connection);
        await gateway.subscribe(connection, {
          id: 'a',
          channel: 'stream:admins'
        });
        await gateway.subscribe(connection, {
          id: 'n',
          channel: 'stream:news'
        });
        mockUsers.set(1, { ...admin, roles: [] });

        await gateway.refresh(1);
        await wait(20);
        mockAuthModel = undefined;

        expect([...connection.subscriptions.keys()]).toEqual(['n']);
        expect(connection.messages.at(-1)).toMatchObject({
          type: 'error',
          id: 'a',
          error: { code: 'REALTIME_SUBSCRIPTION_DENIED' }
        });
      });
    });

    describe('streaming actions', () => {
      const createAssistant = (
        handler: (payload: { prompt: string }, context: any) => any
      ) =>
        createRealtimeAction({
          name: 'assistant',
          payload: Type.Object({ prompt: Type.String() }),
          stream: { codec: 'text' },
          handler
        });

      test('streams the chunks of the handler to its caller, ending with its result', async () => {
        createAssistant(async function* ({ prompt }) {
          yield `${prompt}:`;
          yield 'a';
          return { tokens: 2 };
        });
        const connection = new FakeConnection();
        gateway.open(connection);

        await send(connection, {
          type: 'action',
          id: 'c1',
          action: 'assistant',
          payload: { prompt: 'p' }
        });
        expect(connection.subscriptions.get('c1')?.kind).toBe('action-call');
        await wait(10);

        expect(connection.messages.slice(1)).toEqual([
          expect.objectContaining({
            type: 'stream.start',
            id: 'c1',
            stream: 'assistant',
            codec: 'text'
          }),
          expect.objectContaining({ type: 'chunk', seq: 0, data: 'p:' }),
          expect.objectContaining({ type: 'chunk', seq: 1, data: 'a' }),
          expect.objectContaining({
            type: 'stream.end',
            seq: 2,
            result: { tokens: 2 }
          })
        ]);
        expect(connection.subscriptions.has('c1')).toBe(false);
      });

      test('runs the handler as the user, with the signal of the stream', async () => {
        let received: any;
        createAssistant(async function* (_, context) {
          received = context;
          yield 'a';
        });
        const connection = new FakeConnection();
        gateway.open(connection);

        await send(connection, {
          type: 'action',
          id: 'c1',
          action: 'assistant',
          payload: { prompt: 'p' }
        });
        await wait(10);

        expect(received).toMatchObject({
          user: connection.user,
          transport: 'websocket',
          connectionId: connection.id,
          ack: true
        });
        expect(received.signal.aborted).toBe(true);
      });

      test('ends with the value of a handler returning no chunks', async () => {
        createAssistant(async () => 'done');
        const connection = new FakeConnection();
        gateway.open(connection);

        await send(connection, {
          type: 'action',
          id: 'c1',
          action: 'assistant',
          payload: { prompt: 'p' }
        });
        await wait(10);

        expect(connection.messages.at(-1)).toMatchObject({
          type: 'stream.end',
          seq: 0,
          result: 'done'
        });
      });

      test.each([
        [
          'the generator',
          async function* () {
            yield 'a';
            throw new Error('failed');
          }
        ],
        [
          'the handler',
          () => {
            throw new Error('failed');
          }
        ]
      ])('ends with the error of %s', async (_, handler) => {
        createAssistant(handler as never);
        const connection = new FakeConnection();
        gateway.open(connection);

        await send(connection, {
          type: 'action',
          id: 'c1',
          action: 'assistant',
          payload: { prompt: 'p' }
        });
        await wait(10);

        expect(connection.messages.at(-1)).toMatchObject({
          type: 'stream.error',
          error: { status: 500 }
        });
      });

      test('cancels a stream, stopping the generator', async () => {
        let finished = false;
        createAssistant(async function* (_, { signal }) {
          try {
            for (;;) {
              yield 'a';
              await new Promise((resolve) => setTimeout(resolve, 5));
            }
          } finally {
            finished = signal.aborted;
          }
        });
        const connection = new FakeConnection();
        gateway.open(connection);

        await send(connection, {
          type: 'action',
          id: 'c1',
          action: 'assistant',
          payload: { prompt: 'p' }
        });
        await wait(12);
        await send(connection, { type: 'cancel', id: 'c1' });
        await send(connection, { type: 'cancel', id: 'missing' });
        await wait(20);

        expect(connection.messages.at(-1)).toMatchObject({
          type: 'stream.end',
          cancelled: true
        });
        expect(finished).toBe(true);
        expect(connection.subscriptions.size).toBe(0);
      });

      test('cancels a stream unsubscribed from', async () => {
        createAssistant(async function* () {
          yield 'a';
          await new Promise((resolve) => setTimeout(resolve, 50));
          yield 'b';
        });
        const connection = new FakeConnection();
        gateway.open(connection);

        await send(connection, {
          type: 'action',
          id: 'c1',
          action: 'assistant',
          payload: { prompt: 'p' }
        });
        await wait(5);
        await send(connection, { type: 'unsubscribe', id: 'c1' });

        expect(types(connection).slice(-2)).toEqual([
          'stream.end',
          'unsubscribed'
        ]);
      });

      test('resumes the stream of a disconnected caller on a new connection', async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        createAssistant(async function* () {
          yield 'a';
          yield 'b';
          await gate;
          yield 'c';
        });
        const first = new FakeConnection();
        gateway.open(first);
        await send(first, {
          type: 'action',
          id: 'c1',
          action: 'assistant',
          payload: { prompt: 'p' }
        });
        await wait(5);
        const start = first.messages.find(
          (message) => message.type === 'stream.start'
        ) as { streamId: string };
        first.close(RealtimeCloseCode.GoingAway, 'Gone');
        await gateway.release(first);

        const second = new FakeConnection();
        gateway.open(second);
        await send(second, {
          type: 'resume',
          id: 'r1',
          streamId: start.streamId,
          seq: 1
        });
        release();
        await wait(10);

        expect(
          second.messages
            .filter((message) => message.type === 'chunk')
            .map((message) => (message as { data: string }).data)
        ).toEqual(['b', 'c']);
        expect(second.messages.at(-1)).toMatchObject({ type: 'stream.end' });
        expect(second.subscriptions.size).toBe(0);
      });

      test('resumes an ended stream without a subscription', async () => {
        createAssistant(async function* () {
          yield 'a';
        });
        const connection = new FakeConnection();
        gateway.open(connection);
        await send(connection, {
          type: 'action',
          id: 'c1',
          action: 'assistant',
          payload: { prompt: 'p' }
        });
        await wait(10);
        const start = connection.messages.find(
          (message) => message.type === 'stream.start'
        ) as { streamId: string };

        await send(connection, {
          type: 'resume',
          id: 'r1',
          streamId: start.streamId,
          seq: 0
        });

        expect(types(connection).slice(-3)).toEqual([
          'stream.start',
          'chunk',
          'stream.end'
        ]);
        expect(connection.subscriptions.size).toBe(0);
      });

      test.each([
        [
          'an unknown stream',
          { streamId: 'x', seq: 0 },
          'REALTIME_STREAM_NOT_FOUND'
        ],
        [
          'an invalid resume',
          { streamId: 'x', seq: 'x' },
          'REALTIME_MESSAGE_INVALID'
        ]
      ])('refuses to resume %s', async (_, resume, code) => {
        const connection = new FakeConnection();
        gateway.open(connection);

        await send(connection, { type: 'resume', id: 'r1', ...resume });

        expect(connection.messages.at(-1)).toMatchObject({
          type: 'error',
          id: 'r1',
          error: { code }
        });
      });

      test('refuses a streaming action called without an ID', async () => {
        const handler = jest.fn();
        createAssistant(handler);
        const connection = new FakeConnection();
        gateway.open(connection);

        await send(connection, {
          type: 'action',
          action: 'assistant',
          payload: { prompt: 'p' }
        });

        expect(handler).not.toHaveBeenCalled();
        expect(connection.messages).toHaveLength(1);
        await expect(
          gateway.callAction(
            'assistant',
            { prompt: 'p' },
            {
              user: connection.user,
              transport: 'http',
              ack: true
            }
          )
        ).rejects.toMatchObject({ code: ErrorCode.RealtimeMessageInvalid });
      });

      test('refuses to stream an action without a stream', () => {
        createRealtimeAction({
          name: 'plain',
          payload: Type.Object({}),
          public: true,
          handler: () => 1
        });

        expect(() =>
          gateway.openActionCall(
            'plain',
            {},
            { user: null, transport: 'http', ack: true }
          )
        ).toThrow(
          expect.objectContaining({ code: ErrorCode.RealtimeMessageInvalid })
        );
      });

      test('traces a streaming action until its stream ends', async () => {
        const telemetry = recordTelemetry();
        createAssistant(async function* () {
          yield 'a';
        });
        const connection = new FakeConnection();
        gateway.open(connection);

        await send(connection, {
          type: 'action',
          id: 'c1',
          action: 'assistant',
          payload: { prompt: 'p' }
        });
        await wait(10);

        expect(
          telemetry.span('realtime action assistant').attributes
        ).toMatchObject({
          'appweaver.realtime.action': 'assistant',
          'appweaver.realtime.transport': 'websocket'
        });
        await telemetry.stop();
      });
    });

    describe('calls with an input', () => {
      const createVoice = (
        handler: (payload: object, context: any) => any,
        input: object = { codec: 'text' },
        stream?: object
      ) =>
        createRealtimeAction({
          name: 'voice',
          payload: Type.Object({}),
          input,
          ...(stream ? { stream } : {}),
          handler
        });

      const call = (connection: FakeConnection, id = 'c1') =>
        send(connection, { type: 'action', id, action: 'voice', payload: {} });

      test('reads the input of the client, answering with the result', async () => {
        configOverrides.REALTIME_STREAM_INPUT_WINDOW = '100B';
        createVoice(async (_, { input }) => {
          const chunks: string[] = [];
          for await (const chunk of input) {
            chunks.push(chunk);
          }
          return chunks.join('');
        });
        const connection = new FakeConnection();
        gateway.open(connection);

        await call(connection);
        await send(connection, {
          type: 'input',
          id: 'c1',
          data: 'a'.repeat(20)
        });
        await send(connection, {
          type: 'input',
          id: 'c1',
          data: 'b'.repeat(20)
        });
        await send(connection, { type: 'input.end', id: 'c1' });
        await wait(10);

        const messages = connection.messages.slice(1);
        expect(messages[0]).toEqual({
          type: 'input.credit',
          id: 'c1',
          bytes: 100
        });
        // The bytes read are given back once half the window
        expect(
          messages.filter((message) => message.type === 'input.credit')
        ).toHaveLength(3);
        expect(messages.at(-1)).toEqual({
          type: 'result',
          id: 'c1',
          result: 'a'.repeat(20) + 'b'.repeat(20)
        });
        expect(connection.subscriptions.size).toBe(0);
        expect(gateway.calls.size).toBe(0);
      });

      test('reads the binary messages of a binary input, and streams its answer', async () => {
        createVoice(
          async function* (_, { input }) {
            for await (const chunk of input) {
              yield chunk.length;
            }
          },
          { codec: 'binary' },
          { codec: 'json' }
        );
        const connection = new FakeConnection();
        gateway.open(connection);

        await call(connection);
        const frame = (bytes: number[]) =>
          new Uint8Array([1, 2, ...Buffer.from('c1'), ...bytes]);
        expect(gateway.handleBinary(connection, frame([1, 2, 3]))).toBe(true);
        await send(connection, { type: 'input', id: 'c1', data: 'AQ==' });
        await send(connection, { type: 'input.end', id: 'c1' });
        await wait(10);

        expect(
          connection.messages
            .filter((message) => message.type === 'chunk')
            .map((message) => (message as { data: unknown }).data)
        ).toEqual([3, 1]);
        expect(connection.messages.at(-1)).toMatchObject({
          type: 'stream.end'
        });
      });

      test.each([
        ['another first byte', [2, 1, 99]],
        ['an ID longer than the message', [1, 9, 99]],
        ['an empty ID', [1, 0, 99]]
      ])('refuses a binary message of %s', (_, bytes) => {
        const connection = new FakeConnection();
        gateway.open(connection);

        expect(gateway.handleBinary(connection, new Uint8Array(bytes))).toBe(
          false
        );
      });

      test('fails a call whose client sends beyond its window', async () => {
        configOverrides.REALTIME_STREAM_INPUT_WINDOW = '30B';
        createVoice(async (_, { signal }) => {
          await new Promise((resolve) =>
            signal.addEventListener('abort', resolve)
          );
        });
        const connection = new FakeConnection();
        gateway.open(connection);

        await call(connection);
        await send(connection, {
          type: 'input',
          id: 'c1',
          data: 'a'.repeat(40)
        });
        await wait(10);

        expect(connection.messages.at(-1)).toMatchObject({
          type: 'error',
          id: 'c1',
          error: { code: 'REALTIME_MESSAGE_INVALID' }
        });
        expect(connection.subscriptions.size).toBe(0);
      });

      test('fails a call whose input passes its limit', async () => {
        createVoice(
          async (_, { input }) => {
            for await (const _chunk of input) {
              // Reads every chunk
            }
          },
          { codec: 'text', maxBytes: '100B' }
        );
        const connection = new FakeConnection();
        gateway.open(connection);

        await call(connection);
        await send(connection, {
          type: 'input',
          id: 'c1',
          data: 'a'.repeat(20)
        });
        await wait(5);
        await send(connection, {
          type: 'input',
          id: 'c1',
          data: 'a'.repeat(20)
        });
        await wait(10);

        expect(connection.messages.at(-1)).toMatchObject({
          type: 'error',
          id: 'c1',
          error: { code: 'REALTIME_INPUT_LIMIT', status: 413 }
        });
      });

      test('answers the input of no call receiving one', async () => {
        createAssistantLike();
        const connection = new FakeConnection();
        gateway.open(connection);

        await send(connection, { type: 'input', id: 'missing', data: 'a' });
        await send(connection, {
          type: 'action',
          id: 'a1',
          action: 'assistant',
          payload: {}
        });
        await send(connection, { type: 'input', id: 'a1', data: 'a' });

        expect(
          connection.messages.filter((message) => message.type === 'error')
        ).toEqual([
          expect.objectContaining({
            id: 'missing',
            error: expect.objectContaining({ code: 'REALTIME_MESSAGE_INVALID' })
          }),
          expect.objectContaining({ id: 'a1' })
        ]);
      });

      test('cancels a call with an input, by the client or once it disconnects', async () => {
        const signals: AbortSignal[] = [];
        createVoice(async (_, { input, signal }) => {
          signals.push(signal);
          for await (const _chunk of input) {
            // Waits for the input
          }
        });
        const connection = new FakeConnection();
        gateway.open(connection);

        await call(connection, 'c1');
        await call(connection, 'c2');
        await send(connection, { type: 'cancel', id: 'c1' });
        expect(connection.subscriptions.has('c1')).toBe(false);
        connection.close(RealtimeCloseCode.GoingAway, 'Gone');
        await gateway.release(connection);
        await wait(10);

        expect(signals.map((signal) => signal.aborted)).toEqual([true, true]);
        expect(gateway.calls.size).toBe(0);
        expect(
          connection.messages.filter((message) => message.type === 'result')
        ).toEqual([]);
      });

      test('refuses a call with an input over HTTP', () => {
        createVoice(() => undefined);

        expect(() =>
          gateway.openActionCall(
            'voice',
            {},
            { user: { id: 1 } as never, transport: 'http', ack: true }
          )
        ).toThrow(
          expect.objectContaining({ code: ErrorCode.RealtimeMessageInvalid })
        );
      });

      /** An action streaming its result, without an input. */
      function createAssistantLike() {
        createRealtimeAction({
          name: 'assistant',
          payload: Type.Object({}),
          stream: {},
          async *handler() {
            yield 'a';
            await wait(50);
          }
        });
      }
    });

    describe('access changes', () => {
      const member = (roles: string[] = ['member']) => ({
        id: 1,
        email: 'u@test.com',
        enabled: true,
        logoutAt: null as Date | null,
        roles: roles.map((name, i) => ({ id: i, name, permissions: [] }))
      });

      beforeEach(async () => {
        mockAuthModel = 'User';
        mockUsers.clear();
        await gateway.onReady();
        createRealtimeAction({
          name: 'assistant',
          payload: Type.Object({}),
          roles: ['member'],
          stream: {},
          async *handler(_, { signal }) {
            yield 'a';
            await new Promise((resolve) =>
              signal!.addEventListener('abort', resolve)
            );
          }
        });
      });

      afterEach(() => {
        mockAuthModel = undefined;
      });

      test('ends the calls of a user logging out at once, over HTTP too', async () => {
        const connection = new FakeConnection(member());
        gateway.open(connection);
        await send(connection, {
          type: 'action',
          id: 'c1',
          action: 'assistant',
          payload: {}
        });
        const sink = new FakeSink();
        const http = gateway.openActionCall(
          'assistant',
          {},
          { user: member() as never, transport: 'http', ack: true },
          { sink }
        );
        await wait(10);

        inject(Events).emitResourceEvent('User', 'update', {
          previous: member(),
          current: { ...member(), logoutAt: new Date() }
        });
        await wait(20);

        expect(http.ended).toBe(true);
        expect(sink.messages.at(-1)).toMatchObject({
          type: 'stream.error',
          error: { code: 'REALTIME_ACTION_DENIED' }
        });
        expect(connection.messages).toContainEqual(
          expect.objectContaining({
            type: 'stream.error',
            error: expect.objectContaining({ code: 'REALTIME_ACTION_DENIED' })
          })
        );
        expect(connection.closedWith?.[0]).toBe(
          RealtimeCloseCode.Reauthenticate
        );
        expect(gateway.calls.size).toBe(0);
      });

      test('ends the calls of a user losing the access of their action', async () => {
        const sink = new FakeSink();
        const http = gateway.openActionCall(
          'assistant',
          {},
          { user: member() as never, transport: 'http', ack: true },
          { sink }
        );
        const kept = gateway.openActionCall(
          'assistant',
          {},
          {
            user: { ...member(), id: 2 } as never,
            transport: 'http',
            ack: true
          },
          { sink: new FakeSink() }
        );
        mockUsers.set(1, member(['guest']));

        await gateway.refresh(1);
        await wait(20);

        expect(http.ended).toBe(true);
        expect(http.error).toMatchObject({
          code: ErrorCode.RealtimeActionDenied
        });
        expect(kept.ended).toBe(false);
        kept.cancel();
      });

      test('keeps the calls of a user keeping the access', async () => {
        const http = gateway.openActionCall(
          'assistant',
          {},
          { user: member() as never, transport: 'http', ack: true },
          { sink: new FakeSink() }
        );
        mockUsers.set(1, member(['member', 'admin']));

        await gateway.refresh(1);
        await wait(20);

        expect(http.ended).toBe(false);
        expect(http.user).toEqual(member(['member', 'admin']));
        http.cancel();
      });

      test('ends the calls of a user disabled since', async () => {
        const http = gateway.openActionCall(
          'assistant',
          {},
          { user: member() as never, transport: 'http', ack: true },
          { sink: new FakeSink() }
        );
        mockUsers.set(1, { ...member(), enabled: false });

        await gateway.refresh(1);
        await wait(20);

        expect(http.error).toMatchObject({
          code: ErrorCode.RealtimeActionDenied
        });
      });
    });

    describe('streams bound to a record', () => {
      const asUser: unknown[] = [];

      beforeEach(() => {
        asUser.length = 0;
        context.resource.services.set('ChatRoom', {
          find: async (id: unknown) => {
            asUser.push([id, currentAuthUser()?.id]);
            if (id !== 1 && id !== 'general') {
              throw new Error('Not found');
            }
            return { id };
          }
        } as never);
      });

      test('lets subscribe the users finding the record of a key', async () => {
        createStream({ name: 'room', resource: { model: 'ChatRoom' } });
        createStream({
          name: 'named',
          params: Type.Object({ name: Type.String() }),
          resource: { model: 'ChatRoom', id: (_, { name }) => name }
        });
        const connection = new FakeConnection();
        gateway.open(connection);

        await gateway.subscribe(connection, {
          id: 'a',
          channel: 'stream:room',
          key: '1'
        });
        await gateway.subscribe(connection, {
          id: 'b',
          channel: 'stream:named',
          params: { name: 'general' }
        });
        await expect(
          gateway.subscribe(connection, {
            id: 'c',
            channel: 'stream:room',
            key: '2'
          })
        ).rejects.toMatchObject({
          code: ErrorCode.RealtimeSubscriptionDenied
        });

        expect(asUser).toEqual([
          [1, 1],
          ['general', 1],
          [2, 1]
        ]);
      });

      test('denies a stream bound to a model without a service', async () => {
        createStream({ name: 'lost', resource: { model: 'Missing' } });
        const connection = new FakeConnection();
        gateway.open(connection);

        await expect(
          gateway.subscribe(connection, {
            id: 'a',
            channel: 'stream:lost',
            key: 'x'
          })
        ).rejects.toMatchObject({
          code: ErrorCode.RealtimeSubscriptionDenied
        });
      });
    });

    describe('rolling updates', () => {
      const createAssistant = (
        handler: (...args: any[]) => any = async function* (
          _: unknown,
          { signal }: any
        ) {
          yield 'a';
          await new Promise((resolve) =>
            signal.addEventListener('abort', resolve)
          );
        }
      ) =>
        createRealtimeAction({
          name: 'assistant',
          payload: Type.Object({}),
          public: true,
          stream: {},
          handler
        });

      test('moves the clients to another instance, refusing the new connections and calls', async () => {
        createAssistant(async function* () {
          yield 'a';
        });
        const connection = new FakeConnection();
        gateway.open(connection);

        await gateway.drain();

        expect(gateway.draining).toBe(true);
        expect(connection.closedWith).toEqual([
          RealtimeCloseCode.ServiceRestart,
          'Server restarting'
        ]);
        expect(gateway.connections.size).toBe(0);
        expect(() => gateway.open(new FakeConnection())).toThrow(
          expect.objectContaining({ code: ErrorCode.RealtimeShuttingDown })
        );
        expect(() =>
          gateway.openActionCall(
            'assistant',
            {},
            { user: null, transport: 'http', ack: true },
            { sink: new FakeSink() }
          )
        ).toThrow(
          expect.objectContaining({ code: ErrorCode.RealtimeShuttingDown })
        );
      });

      test('lets the calls end, keeping the connections streaming an input', async () => {
        createRealtimeAction({
          name: 'voice',
          payload: Type.Object({}),
          input: {},
          async handler(_, { input }) {
            const chunks: string[] = [];
            for await (const chunk of input!) {
              chunks.push(chunk);
            }
            return chunks;
          }
        });
        let release!: () => void;
        const gate = new Promise<void>((resolve) => (release = resolve));
        createAssistant(async function* () {
          yield 'a';
          await gate;
          yield 'b';
        });
        const speaking = new FakeConnection();
        const idle = new FakeConnection({ id: 2 });
        gateway.open(speaking);
        gateway.open(idle);
        await send(speaking, {
          type: 'action',
          id: 'v',
          action: 'voice',
          payload: {}
        });
        const http = new FakeSink();
        gateway.openActionCall(
          'assistant',
          {},
          { user: null, transport: 'http', ack: true },
          { sink: http }
        );
        await wait(10);

        const draining = gateway.drain();
        await wait(50);
        expect(idle.closedWith?.[0]).toBe(RealtimeCloseCode.ServiceRestart);
        expect(speaking.closed).toBe(false);

        await send(speaking, { type: 'input', id: 'v', data: 'hi' });
        await send(speaking, { type: 'input.end', id: 'v' });
        release();
        await draining;

        expect(speaking.messages).toContainEqual({
          type: 'result',
          id: 'v',
          result: ['hi']
        });
        expect(speaking.closedWith?.[0]).toBe(RealtimeCloseCode.ServiceRestart);
        expect(http.messages.at(-1)).toMatchObject({ type: 'stream.end' });
        expect(gateway.calls.size).toBe(0);
      });

      test('ends the calls still running after the grace period', async () => {
        configOverrides.REALTIME_SHUTDOWN_GRACE_PERIOD = 50;
        createAssistant();
        const sink = new FakeSink();
        gateway.openActionCall(
          'assistant',
          {},
          { user: null, transport: 'http', ack: true },
          { sink }
        );

        await gateway.drain();

        expect(sink.messages.at(-1)).toMatchObject({
          type: 'stream.error',
          error: { code: 'REALTIME_SHUTTING_DOWN', status: 503 }
        });
      });

      test('cancels the calls when destroyed', async () => {
        createAssistant();
        const call = gateway.openActionCall(
          'assistant',
          {},
          { user: null, transport: 'http', ack: true },
          { sink: new FakeSink() }
        );

        await gateway.onDestroy();

        expect(call.ended).toBe(true);
      });

      describe('a call of another instance', () => {
        let owner: StreamHub;

        beforeEach(async () => {
          owner = new StreamHub();
          await owner.onReady();
        });

        afterEach(async () => {
          await owner.onDestroy();
        });

        const resume = async (
          connection: FakeConnection,
          streamId: string,
          seq = 0
        ) => send(connection, { type: 'resume', id: 'r1', streamId, seq });

        test('resumes the stream of a call of another instance', async () => {
          const instance = owner.openAction('assistant', streamSettings(), '1');
          instance.write('a');
          const connection = new FakeConnection();
          gateway.open(connection);

          await resume(connection, instance.streamId);
          instance.write('b');
          await wait(30);
          instance.end();
          await wait(10);

          expect(
            connection.messages
              .filter((message) => message.type === 'chunk')
              .map((message) => (message as { data: unknown }).data)
          ).toEqual(['a', 'b']);
          expect(connection.messages.at(-1)).toMatchObject({
            type: 'stream.end'
          });
          expect(connection.subscriptions.size).toBe(0);
        });

        test('cancels a resumed call on the instance running it', async () => {
          const instance = owner.openAction('assistant', streamSettings(), '1');
          const connection = new FakeConnection();
          gateway.open(connection);
          await resume(connection, instance.streamId);
          expect(connection.subscriptions.get('r1')?.kind).toBe('remote-call');

          await send(connection, { type: 'cancel', id: 'r1' });
          await wait(10);

          expect(instance.endEntry?.frame.message).toMatchObject({
            cancelled: true
          });
          expect(connection.subscriptions.size).toBe(0);
        });

        test('unsubscribes a resumed call, and lets its owner linger it once its client left', async () => {
          configOverrides.REALTIME_STREAM_LINGER = 30;
          const instance = owner.openAction('assistant', streamSettings(), '1');
          const first = new FakeConnection();
          const second = new FakeConnection();
          gateway.open(first);
          gateway.open(second);
          await send(first, {
            type: 'resume',
            id: 'a',
            streamId: instance.streamId,
            seq: 0
          });
          await send(second, {
            type: 'resume',
            id: 'b',
            streamId: instance.streamId,
            seq: 0
          });

          await send(first, { type: 'unsubscribe', id: 'a' });
          await wait(10);
          expect(instance.ended).toBe(true);

          const third = owner.openAction('assistant', streamSettings(), '1');
          const leaving = new FakeConnection();
          gateway.open(leaving);
          await send(leaving, {
            type: 'resume',
            id: 'c',
            streamId: third.streamId,
            seq: 0
          });
          leaving.close(RealtimeCloseCode.GoingAway, 'Gone');
          await gateway.release(leaving);
          await wait(80);

          expect(third.endEntry?.frame.message).toMatchObject({
            cancelled: true
          });
        });

        test('refuses to resume the call of another user', async () => {
          configOverrides.REALTIME_STREAM_RELAY_HEARTBEAT = 100;
          const instance = owner.openAction('assistant', streamSettings(), '2');
          const connection = new FakeConnection();
          gateway.open(connection);

          await resume(connection, instance.streamId);

          expect(connection.messages.at(-1)).toMatchObject({
            type: 'error',
            id: 'r1',
            error: { code: 'REALTIME_STREAM_NOT_FOUND' }
          });
          expect(connection.subscriptions.size).toBe(0);
          instance.cancel();
        });

        test('leaves a resumed stream of a connection closed meanwhile', async () => {
          const instance = owner.openAction('assistant', streamSettings(), '1');
          const connection = new FakeConnection();
          gateway.open(connection);

          const resuming = resume(connection, instance.streamId);
          connection.close(RealtimeCloseCode.GoingAway, 'Gone');
          await resuming;
          await gateway.release(connection);

          expect(connection.subscriptions.size).toBe(0);
          instance.cancel();
        });
      });
    });
  });
});
