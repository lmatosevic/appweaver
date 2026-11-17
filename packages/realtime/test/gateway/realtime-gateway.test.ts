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
import { define, inject } from '@appweaver/core';
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
import { RealtimeCloseCode } from '../../types';
import { FakeConnection } from '../fixtures/fake-connection';

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
        expect(connection.subscriptions.get('c1')?.kind).toBe('action-stream');
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
          gateway.openActionStream(
            'plain',
            {},
            { user: null, transport: 'http', ack: true },
            {} as never
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
  });
});
