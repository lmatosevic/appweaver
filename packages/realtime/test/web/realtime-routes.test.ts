import { Type } from '@sinclair/typebox';
import { configOverrides, Events } from '@appweaver/common';
import { inject } from '@appweaver/core';
import { context } from '@appweaver/core/internal';
import { createModel } from '@appweaver/data';
import { linkModels, resetContext } from '@appweaver/testing';
import { createRealtimeAction } from '../../action';
import { createChannel } from '../../channel';
import { TicketService } from '../../gateway/ticket-service';
import { createStream } from '../../stream/create-stream';
import {
  openEventStream,
  RealtimeServer,
  startRealtimeServer,
  TestSocket
} from '../fixtures/realtime-server';

const user = { id: 1, email: 'user@test.com', enabled: true, roles: [] };
const admin = {
  id: 2,
  email: 'admin@test.com',
  enabled: true,
  roles: [{ id: 1, name: 'admin', permissions: [] }]
};

/** Waits until the condition holds, failing after two seconds. */
async function until(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('Condition not met');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('realtime routes', () => {
  let app: RealtimeServer;
  let sockets: TestSocket[];

  const ticket = async (authUser: object = user, headers = {}) => {
    const response = await fetch(`${app.url}/ticket`, {
      method: 'POST',
      headers: { 'x-user': JSON.stringify(authUser), ...headers }
    });
    return (await response.json()).ticket as string;
  };

  const connect = async (authUser: object = user) => {
    const socket = await TestSocket.open(
      `${app.ws}/ws?ticket=${await ticket(authUser)}`
    );
    sockets.push(socket);
    await socket.next((m) => m.type === 'welcome');
    return socket;
  };

  beforeEach(async () => {
    resetContext();
    sockets = [];
  });

  afterEach(async () => {
    sockets.forEach((socket) => socket.close());
    await app?.close();
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  describe('POST /ticket', () => {
    test('issues a ticket to an authenticated user', async () => {
      app = await startRealtimeServer();

      const response = await fetch(`${app.url}/ticket`, {
        method: 'POST',
        headers: { 'x-user': JSON.stringify(user) }
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        ticket: expect.stringMatching(/^[\w-]{43}$/),
        expiresIn: 30000
      });
    });

    test('refuses an anonymous request', async () => {
      app = await startRealtimeServer();

      const response = await fetch(`${app.url}/ticket`, { method: 'POST' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /ws', () => {
    test('opens a connection with a ticket used once', async () => {
      app = await startRealtimeServer();
      const used = await ticket();

      const socket = await TestSocket.open(`${app.ws}/ws?ticket=${used}`);
      sockets.push(socket);
      const welcome = await socket.next((m) => m.type === 'welcome');
      const again = await TestSocket.open(`${app.ws}/ws?ticket=${used}`);
      sockets.push(again);
      const refused = await again.next((m) => m.type === 'error');

      expect(welcome).toEqual({
        type: 'welcome',
        connectionId: expect.any(String),
        expiresAt: expect.any(String),
        heartbeat: 25000
      });
      expect(refused.error.code).toBe('REALTIME_TICKET_INVALID');
      await again.next(() => false).catch(() => undefined);
      expect(again.closeCode).toBe(4403);
    });

    test('closes a connection without a ticket', async () => {
      app = await startRealtimeServer();

      const socket = await TestSocket.open(`${app.ws}/ws`);
      sockets.push(socket);
      const error = await socket.next((m) => m.type === 'error');

      expect(error.error.code).toBe('REALTIME_TICKET_INVALID');
    });

    test('opens an anonymous connection when allowed', async () => {
      configOverrides.REALTIME_ANONYMOUS_ENABLED = true;
      app = await startRealtimeServer();
      createChannel({
        name: 'news',
        payload: Type.Object({ title: Type.String() }),
        public: true
      });
      createChannel({ name: 'private', payload: Type.Object({}) });

      const socket = await TestSocket.open(`${app.ws}/ws`);
      sockets.push(socket);
      socket.send({ type: 'subscribe', id: 'n', channel: 'news' });
      socket.send({ type: 'subscribe', id: 'p', channel: 'private' });

      expect(await socket.next((m) => m.id === 'n')).toEqual({
        type: 'subscribed',
        id: 'n'
      });
      expect((await socket.next((m) => m.id === 'p')).error.code).toBe(
        'REALTIME_SUBSCRIPTION_DENIED'
      );
    });

    test('closes the connection when the token expires', async () => {
      app = await startRealtimeServer();
      // An exp already reached, so the connection expires once opened
      const expiring = await ticket(user, {
        'x-exp': String(Math.floor(Date.now() / 1000))
      });

      const socket = await TestSocket.open(`${app.ws}/ws?ticket=${expiring}`);
      sockets.push(socket);
      const reauth = await socket.next((m) => m.type === 'reauth');
      await socket.next(() => false, 1000).catch(() => undefined);

      expect(reauth).toEqual({ type: 'reauth' });
      expect(socket.closeCode).toBe(4401);
    });

    test('delivers the payloads of a channel to its subscriptions', async () => {
      app = await startRealtimeServer();
      const shipped = createChannel({
        name: 'order.shipped',
        payload: Type.Object({ orderId: Type.Integer() }),
        params: Type.Object({ orderId: Type.Optional(Type.Integer()) }),
        deliver: (_, payload, params) =>
          !params.orderId || params.orderId === payload.orderId
      });
      const socket = await connect();

      socket.send({ type: 'subscribe', id: 'all', channel: 'order.shipped' });
      socket.send({
        type: 'subscribe',
        id: 'two',
        channel: 'order.shipped',
        params: { orderId: 2 }
      });
      await socket.next((m) => m.type === 'subscribed' && m.id === 'two');
      await shipped.publish({ orderId: 1 });
      await shipped.publish({ orderId: 2 });
      await socket.next(
        (m) => m.type === 'event' && m.id === 'two' && m.data.orderId === 2
      );

      const events = socket.messages.filter((m) => m.type === 'event');
      expect(events.map((e) => [e.id, e.data.orderId])).toEqual([
        ['all', 1],
        ['all', 2],
        ['two', 2]
      ]);
      expect(events[0]).toEqual({
        type: 'event',
        id: 'all',
        channel: 'order.shipped',
        eventId: expect.any(String),
        data: { orderId: 1 }
      });
    });

    test('stops delivering to a removed subscription', async () => {
      app = await startRealtimeServer();
      const news = createChannel({
        name: 'news',
        payload: Type.Object({ n: Type.Integer() })
      });
      const socket = await connect();

      socket.send({ type: 'subscribe', id: 'a', channel: 'news' });
      await socket.next((m) => m.type === 'subscribed');
      socket.send({ type: 'unsubscribe', id: 'a' });
      await socket.next((m) => m.type === 'unsubscribed');
      await news.publish({ n: 1 });
      socket.send({ type: 'ping', id: 'p' });
      await socket.next((m) => m.type === 'pong');

      expect(socket.messages.filter((m) => m.type === 'event')).toEqual([]);
    });

    test('answers an invalid subscription with its error', async () => {
      app = await startRealtimeServer();
      createChannel({
        name: 'admins',
        payload: Type.Object({}),
        roles: ['admin'],
        params: Type.Object({ room: Type.Integer() })
      });
      createChannel({
        name: 'closed',
        payload: Type.Object({}),
        subscribe: () => false
      });
      const socket = await connect();

      socket.send({ type: 'subscribe', id: 'u', channel: 'unknown' });
      socket.send({ type: 'subscribe', id: 'r', channel: 'admins' });
      socket.send({ type: 'subscribe', id: 'c', channel: 'closed' });
      socket.send({ type: 'subscribe', id: 'x y', channel: 'closed' });
      const errors = await Promise.all(
        ['u', 'r', 'c'].map((id) => socket.next((m) => m.id === id))
      );
      const admin1 = await connect(admin);
      admin1.send({
        type: 'subscribe',
        id: 'p',
        channel: 'admins',
        params: { room: 'one' }
      });
      const invalid = await admin1.next((m) => m.id === 'p');

      expect(errors.map((e) => e.error.code)).toEqual([
        'REALTIME_CHANNEL_UNKNOWN',
        'REALTIME_SUBSCRIPTION_DENIED',
        'REALTIME_SUBSCRIPTION_DENIED'
      ]);
      expect((await socket.next((m) => m.id === 'x y')).error.code).toBe(
        'REALTIME_MESSAGE_INVALID'
      );
      expect(invalid.error).toMatchObject({
        status: 400,
        code: 'REALTIME_PAYLOAD_INVALID',
        details: { errors: [{ path: '/room', message: expect.any(String) }] }
      });
    });

    test('answers the messages breaking the protocol', async () => {
      app = await startRealtimeServer();
      const socket = await connect();

      socket.socket.send('not json');
      socket.send([1]);
      socket.send({ type: 'shout', id: 's' });
      await socket.next((m) => m.id === 's');

      expect(
        socket.messages
          .filter((m) => m.type === 'error')
          .map((m) => [m.id, m.error.code])
      ).toEqual([
        [undefined, 'REALTIME_MESSAGE_INVALID'],
        [undefined, 'REALTIME_MESSAGE_INVALID'],
        ['s', 'REALTIME_MESSAGE_INVALID']
      ]);
    });

    test('calls an action with an ack and without one', async () => {
      app = await startRealtimeServer();
      const calls: unknown[] = [];
      createRealtimeAction({
        name: 'chat.typing',
        payload: Type.Object({ roomId: Type.Integer() }),
        response: Type.Object({ seen: Type.Integer() }),
        handler: (payload, actionContext) => {
          calls.push([payload, actionContext]);
          return { seen: payload.roomId * 2 };
        }
      });
      createRealtimeAction({
        name: 'broken',
        payload: Type.Object({}),
        handler: () => {
          throw new Error('broken');
        }
      });
      const socket = await connect();

      socket.send({
        type: 'action',
        id: 'a1',
        action: 'chat.typing',
        payload: { roomId: 21 }
      });
      socket.send({
        type: 'action',
        action: 'chat.typing',
        payload: { roomId: 1 }
      });
      socket.send({ type: 'action', action: 'broken', payload: {} });
      socket.send({ type: 'action', id: 'a2', action: 'missing' });
      socket.send({ type: 'action', id: 'a3', action: 'chat.typing' });
      socket.send({ type: 'action', id: 'a4' });

      expect(await socket.next((m) => m.id === 'a1')).toEqual({
        type: 'result',
        id: 'a1',
        result: { seen: 42 }
      });
      expect((await socket.next((m) => m.id === 'a2')).error.code).toBe(
        'REALTIME_ACTION_UNKNOWN'
      );
      expect((await socket.next((m) => m.id === 'a3')).error.code).toBe(
        'REALTIME_PAYLOAD_INVALID'
      );
      expect((await socket.next((m) => m.id === 'a4')).error.code).toBe(
        'REALTIME_MESSAGE_INVALID'
      );
      expect(calls).toEqual([
        [
          { roomId: 21 },
          {
            user,
            transport: 'websocket',
            connectionId: expect.any(String),
            ack: true
          }
        ],
        [{ roomId: 1 }, expect.objectContaining({ ack: false })]
      ]);
      expect(socket.messages.filter((m) => m.type === 'error')).toHaveLength(3);
    });

    test('limits the messages of a client', async () => {
      configOverrides.REALTIME_MESSAGE_RATE_LIMIT = 2;
      app = await startRealtimeServer();
      const socket = await connect();

      for (const id of ['1', '2', '3']) {
        socket.send({ type: 'ping', id });
      }

      expect((await socket.next((m) => m.id === '3')).error.code).toBe(
        'REALTIME_RATE_LIMITED'
      );
    });

    test('limits the connections of a user', async () => {
      configOverrides.REALTIME_MAX_CONNECTIONS_PER_USER = 1;
      app = await startRealtimeServer();
      await connect();

      const second = await TestSocket.open(
        `${app.ws}/ws?ticket=${await ticket()}`
      );
      sockets.push(second);
      const error = await second.next((m) => m.type === 'error');
      await second.next(() => false).catch(() => undefined);

      expect(error.error.code).toBe('REALTIME_CONNECTION_LIMIT');
      expect(second.closeCode).toBe(4429);
    });

    test('limits the subscriptions of a connection', async () => {
      configOverrides.REALTIME_MAX_SUBSCRIPTIONS = 1;
      app = await startRealtimeServer();
      createChannel({ name: 'news', payload: Type.Object({}) });
      const socket = await connect();

      socket.send({ type: 'subscribe', id: 'a', channel: 'news' });
      socket.send({ type: 'subscribe', id: 'a', channel: 'news' });
      socket.send({ type: 'subscribe', id: 'b', channel: 'news' });

      expect((await socket.next((m) => m.id === 'b')).error.code).toBe(
        'REALTIME_SUBSCRIPTION_LIMIT'
      );
      expect(
        socket.messages.filter((m) => m.id === 'a').map((m) => m.type)
      ).toEqual(['subscribed', 'error']);
    });

    test('closes the connections when the server closes', async () => {
      app = await startRealtimeServer();
      const socket = await connect();

      await app.server.close();
      await socket.next(() => false).catch(() => undefined);

      // The client reconnects at once to another instance
      expect(socket.closeCode).toBe(1012);
      expect(app.gateway.connections.size).toBe(0);
    });
  });

  describe('resource events', () => {
    beforeEach(() => {
      createModel({
        name: 'Post',
        scalars: {
          title: { type: 'string' },
          secret: { type: 'string', hidden: true },
          ownerId: { type: 'int' }
        }
      });
      linkModels();
    });

    const exposePost = (events: object) => {
      context.resource.routes.set('Post', {
        config: { modelName: 'Post', events },
        basePath: 'posts',
        handler: () => undefined
      } as never);
      context.resource.services.set('Post', {
        checkEventAccess: async (event: any) =>
          inject(Events) && event.current.ownerId !== 99
      } as never);
    };

    test('delivers the exposed events, projected and checked', async () => {
      exposePost({ actions: ['create', 'update'] });
      app = await startRealtimeServer();
      await app.gateway.onReady();
      const socket = await connect();

      socket.send({ type: 'subscribe', id: 'posts', channel: 'resource:Post' });
      socket.send({
        type: 'subscribe',
        id: 'mine',
        channel: 'resource:Post.update',
        filter: { ownerId: 1 }
      });
      await socket.next((m) => m.id === 'mine');
      const events = inject(Events);
      events.emitResourceEvent('Post', 'create', {
        current: { id: 1, title: 'A', secret: 's', ownerId: 1 }
      });
      events.emitResourceEvent('Post', 'create', {
        current: { id: 2, title: 'B', secret: 's', ownerId: 99 }
      });
      events.emitResourceEvent('Post', 'delete', {
        current: { id: 1, title: 'A', secret: 's', ownerId: 1 }
      });
      events.emitResourceEvent('Post', 'update', {
        previous: { id: 3, title: 'C', ownerId: 2 },
        current: { id: 3, title: 'D', ownerId: 2 }
      });
      events.emitResourceEvent('Post', 'update', {
        previous: { id: 1, title: 'A', ownerId: 1 },
        current: { id: 1, title: 'E', ownerId: 1 }
      });
      await socket.next((m) => m.type === 'event' && m.id === 'mine');

      const received = socket.messages
        .filter((m) => m.type === 'event')
        .map((m) => [m.id, m.data]);
      expect(received).toEqual([
        [
          'posts',
          {
            model: 'Post',
            action: 'create',
            current: { id: 1, title: 'A', ownerId: 1 }
          }
        ],
        [
          'posts',
          {
            model: 'Post',
            action: 'update',
            previous: { id: 3, title: 'C', ownerId: 2 },
            current: { id: 3, title: 'D', ownerId: 2 }
          }
        ],
        ['posts', expect.objectContaining({ action: 'update' })],
        [
          'mine',
          expect.objectContaining({
            current: expect.objectContaining({ title: 'E' })
          })
        ]
      ]);
    });

    test('applies the access of each action', async () => {
      configOverrides.REALTIME_ANONYMOUS_ENABLED = true;
      exposePost({
        actions: [
          'create',
          { action: 'update', public: true },
          { action: 'delete', roles: ['admin'] }
        ]
      });
      app = await startRealtimeServer();
      await app.gateway.onReady();
      const anonymous = await TestSocket.open(`${app.ws}/ws`);
      sockets.push(anonymous);
      await anonymous.next((m) => m.type === 'welcome');
      const adminSocket = await connect(admin);

      anonymous.send({
        type: 'subscribe',
        id: 'all',
        channel: 'resource:Post'
      });
      anonymous.send({
        type: 'subscribe',
        id: 'c',
        channel: 'resource:Post.create'
      });
      adminSocket.send({
        type: 'subscribe',
        id: 'all',
        channel: 'resource:Post'
      });
      await anonymous.next((m) => m.id === 'c');
      await adminSocket.next((m) => m.id === 'all');
      const events = inject(Events);
      for (const action of ['create', 'update', 'delete'] as const) {
        events.emitResourceEvent('Post', action, {
          current: { id: 1, title: action, ownerId: 1 }
        });
      }
      await adminSocket.next(
        (m) => m.type === 'event' && m.data.action === 'delete'
      );
      await anonymous.next((m) => m.type === 'event');
      await new Promise((resolve) => setTimeout(resolve, 50));

      const actions = (socket: TestSocket) =>
        socket.messages
          .filter((m) => m.type === 'event')
          .map((m) => m.data.action);
      expect(anonymous.messages.find((m) => m.id === 'c').error.code).toBe(
        'REALTIME_SUBSCRIPTION_DENIED'
      );
      expect(actions(anonymous)).toEqual(['update']);
      expect(actions(adminSocket)).toEqual(['create', 'update', 'delete']);
    });

    test('refuses the channels of the events a model does not expose', async () => {
      exposePost({ actions: ['create'], roles: ['admin'] });
      app = await startRealtimeServer();
      const socket = await connect();
      const adminSocket = await connect(admin);

      socket.send({
        type: 'subscribe',
        id: 'u',
        channel: 'resource:Post.update'
      });
      socket.send({ type: 'subscribe', id: 'c', channel: 'resource:Post' });
      socket.send({ type: 'subscribe', id: 'm', channel: 'resource:Comment' });
      adminSocket.send({
        type: 'subscribe',
        id: 'a',
        channel: 'resource:Post'
      });

      expect((await socket.next((m) => m.id === 'u')).error.code).toBe(
        'REALTIME_CHANNEL_UNKNOWN'
      );
      expect((await socket.next((m) => m.id === 'c')).error.code).toBe(
        'REALTIME_SUBSCRIPTION_DENIED'
      );
      expect((await socket.next((m) => m.id === 'm')).error.code).toBe(
        'REALTIME_CHANNEL_UNKNOWN'
      );
      expect(await adminSocket.next((m) => m.id === 'a')).toEqual({
        type: 'subscribed',
        id: 'a'
      });
    });
  });

  describe('GET /events', () => {
    test('streams the events of the subscriptions of the query', async () => {
      app = await startRealtimeServer();
      const news = createChannel({
        name: 'news',
        payload: Type.Object({ title: Type.String() })
      });
      const subscriptions = encodeURIComponent(
        JSON.stringify([
          { id: 'n', channel: 'news' },
          { id: 'x', channel: 'unknown' }
        ])
      );

      const stream = await openEventStream(
        `${app.url}/events?ticket=${await ticket()}&subscriptions=${subscriptions}`
      );
      await stream.next((m) => m.id === 'x');
      await news.publish({ title: 'Hello' });
      const event = await stream.next((m) => m.type === 'event');
      stream.abort();

      expect(stream.status).toBe(200);
      expect(stream.messages.slice(0, 3)).toEqual([
        expect.objectContaining({ type: 'welcome' }),
        { type: 'subscribed', id: 'n' },
        expect.objectContaining({
          type: 'error',
          id: 'x',
          error: expect.objectContaining({ code: 'REALTIME_CHANNEL_UNKNOWN' })
        })
      ]);
      expect(event).toEqual({
        type: 'event',
        id: 'n',
        channel: 'news',
        eventId: expect.any(String),
        data: { title: 'Hello' }
      });
    });

    test('answers an invalid ticket with a problem', async () => {
      app = await startRealtimeServer();

      const stream = await openEventStream(`${app.url}/events?ticket=nope`);

      expect(stream.status).toBe(401);
      expect(JSON.parse(stream.body).code).toBe('REALTIME_TICKET_INVALID');
    });

    test('answers invalid subscriptions with a problem', async () => {
      app = await startRealtimeServer();

      const stream = await openEventStream(
        `${app.url}/events?ticket=${await ticket()}&subscriptions=nope`
      );

      expect(stream.status).toBe(400);
      expect(JSON.parse(stream.body).code).toBe('REALTIME_MESSAGE_INVALID');
    });

    test('releases the connection when the client disconnects', async () => {
      app = await startRealtimeServer();

      const stream = await openEventStream(
        `${app.url}/events?ticket=${await ticket()}`
      );
      await stream.next((m) => m.type === 'welcome');
      expect(app.gateway.connections.size).toBe(1);
      stream.abort();
      await until(() => app.gateway.connections.size === 0);

      expect(app.gateway.connections.size).toBe(0);
    });
  });

  describe('POST /actions/:name', () => {
    test('calls an action with the payload of the body', async () => {
      app = await startRealtimeServer();
      const handler = jest.fn(({ a }: { a: number }) => ({ double: a * 2 }));
      createRealtimeAction({
        name: 'double',
        payload: Type.Object({ a: Type.Integer() }),
        handler
      });

      const call = (query = '', body: unknown = { a: 2 }) =>
        fetch(`${app.url}/actions/double${query}`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer test',
            'x-user': JSON.stringify(user),
            'content-type': 'application/json'
          },
          body: JSON.stringify(body)
        });

      const acked = await call();
      const forgotten = await call('?ack=false');
      const invalid = await call('', { a: 'x' });

      expect(acked.status).toBe(200);
      expect(await acked.json()).toEqual({ result: { double: 4 } });
      expect(forgotten.status).toBe(202);
      expect(invalid.status).toBe(400);
      expect(handler).toHaveBeenCalledWith(
        { a: 2 },
        { user, transport: 'http', ack: false }
      );
    });

    test('denies an action to a user without its role', async () => {
      app = await startRealtimeServer();
      createRealtimeAction({
        name: 'admin.only',
        payload: Type.Object({}),
        roles: ['admin'],
        handler: () => 'done'
      });

      const response = await fetch(`${app.url}/actions/admin.only`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test',
          'x-user': JSON.stringify(user),
          'content-type': 'application/json'
        },
        body: '{}'
      });

      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('REALTIME_ACTION_DENIED');
    });

    describe('anonymous calls', () => {
      const anonymousCall = (name: string, headers = {}) =>
        fetch(`${app.url}/actions/${name}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: '{}'
        });

      beforeEach(() => {
        createRealtimeAction({
          name: 'visit',
          payload: Type.Object({}),
          public: true,
          handler: (_, { user: caller }) => ({ anonymous: caller === null })
        });
        createRealtimeAction({
          name: 'private',
          payload: Type.Object({}),
          handler: () => 'secret'
        });
      });

      test('calls a public action without credentials when allowed', async () => {
        configOverrides.REALTIME_ANONYMOUS_ENABLED = true;
        app = await startRealtimeServer();

        const response = await anonymousCall('visit');

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          result: { anonymous: true }
        });
      });

      test('denies a private action without credentials', async () => {
        configOverrides.REALTIME_ANONYMOUS_ENABLED = true;
        app = await startRealtimeServer();

        const response = await anonymousCall('private');

        expect(response.status).toBe(403);
        expect((await response.json()).code).toBe('REALTIME_ACTION_DENIED');
      });

      test('refuses a call without credentials unless allowed', async () => {
        app = await startRealtimeServer();

        const response = await anonymousCall('visit');

        expect(response.status).toBe(401);
        expect((await response.json()).code).toBe('AUTH_UNAUTHORIZED');
      });

      test('refuses invalid credentials instead of calling anonymously', async () => {
        configOverrides.REALTIME_ANONYMOUS_ENABLED = true;
        app = await startRealtimeServer();

        const response = await anonymousCall('visit', {
          authorization: 'Bearer broken'
        });

        expect(response.status).toBe(401);
      });

      test('authenticates a call with an API key', async () => {
        configOverrides.SECURITY_API_KEY_ENABLED = true;
        app = await startRealtimeServer();

        const response = await anonymousCall('visit', {
          'x-api-key': 'key',
          'x-user': JSON.stringify(user)
        });

        expect(await response.json()).toEqual({
          result: { anonymous: false }
        });
      });
    });
  });

  describe('streams', () => {
    const streamCall = (name: string, headers = {}, query = '') =>
      fetch(`${app.url}/actions/${name}${query}`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test',
          'x-user': JSON.stringify(user),
          'content-type': 'application/json',
          accept: 'text/event-stream',
          ...headers
        },
        body: JSON.stringify({ prompt: 'p' })
      });

    const assistant = (
      handler: (...args: any[]) => any = async function* () {
        yield 'Hello';
        yield ' world';
        return { tokens: 2 };
      }
    ) =>
      createRealtimeAction({
        name: 'assistant',
        payload: Type.Object({ prompt: Type.String() }),
        stream: { codec: 'text' },
        handler
      });

    test('streams a streaming action over the WebSocket', async () => {
      app = await startRealtimeServer();
      assistant();
      const socket = await connect();

      socket.send({
        type: 'action',
        id: 'c1',
        action: 'assistant',
        payload: { prompt: 'p' }
      });
      const end = await socket.next((m) => m.type === 'stream.end');

      expect(socket.messages.slice(1).map((m) => m.type)).toEqual([
        'stream.start',
        'chunk',
        'chunk',
        'stream.end'
      ]);
      expect(end).toMatchObject({ seq: 2, result: { tokens: 2 } });
    });

    test('streams a streaming action as the events of its response', async () => {
      app = await startRealtimeServer();
      assistant();

      const response = await streamCall('assistant');
      const body = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain(
        'text/event-stream'
      );
      expect(
        body
          .trim()
          .split('\n\n')
          .map((event) => JSON.parse(event.slice('data: '.length)))
      ).toEqual([
        expect.objectContaining({
          type: 'stream.start',
          id: 'assistant',
          codec: 'text',
          seq: 0
        }),
        expect.objectContaining({ type: 'chunk', data: 'Hello' }),
        expect.objectContaining({ type: 'chunk', data: ' world' }),
        expect.objectContaining({ type: 'stream.end', result: { tokens: 2 } })
      ]);
    });

    test('cancels the stream of a client leaving', async () => {
      app = await startRealtimeServer();
      let aborted = false;
      assistant(async function* (_: unknown, { signal }: any) {
        yield 'a';
        await new Promise((resolve) => setTimeout(resolve, 100));
        aborted = signal.aborted;
      });

      const controller = new AbortController();
      const response = await fetch(`${app.url}/actions/assistant`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer test',
          'x-user': JSON.stringify(user),
          'content-type': 'application/json',
          accept: 'text/event-stream'
        },
        body: JSON.stringify({ prompt: 'p' }),
        signal: controller.signal
      });
      await response.body!.getReader().read();
      controller.abort();
      await until(() => aborted);

      expect(aborted).toBe(true);
    });

    test('refuses a streaming action not accepting its events', async () => {
      app = await startRealtimeServer();
      assistant();

      const json = await streamCall('assistant', {
        accept: 'application/json'
      });
      const forgotten = await streamCall('assistant', {}, '?ack=false');

      expect(json.status).toBe(406);
      expect((await json.json()).code).toBe('REALTIME_STREAM_ACCEPT');
      expect(forgotten.status).toBe(400);
      expect((await forgotten.json()).code).toBe('REALTIME_MESSAGE_INVALID');
    });

    test('answers a refused streaming action with a problem', async () => {
      app = await startRealtimeServer();
      createRealtimeAction({
        name: 'assistant',
        payload: Type.Object({ prompt: Type.String() }),
        roles: ['admin'],
        stream: {},
        async *handler() {
          yield 'a';
        }
      });

      const response = await streamCall('assistant');

      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('REALTIME_ACTION_DENIED');
    });

    test('reads an input streamed over the WebSocket, as binary and JSON messages', async () => {
      app = await startRealtimeServer();
      createRealtimeAction({
        name: 'voice',
        payload: Type.Object({}),
        input: { codec: 'binary' },
        async handler(_, { input }) {
          let bytes = 0;
          for await (const chunk of input!) {
            bytes += chunk.length;
          }
          return { bytes };
        }
      });
      const socket = await connect();

      socket.send({ type: 'action', id: 'c1', action: 'voice', payload: {} });
      await socket.next((m) => m.type === 'input.credit');
      socket.socket.send(new Uint8Array([1, 2, 99, 49, 1, 2, 3]));
      socket.send({ type: 'input', id: 'c1', data: 'AQI=' });
      socket.send({ type: 'input.end', id: 'c1' });
      const result = await socket.next((m) => m.type === 'result');

      expect(result).toEqual({
        type: 'result',
        id: 'c1',
        result: { bytes: 5 }
      });
    });

    test('refuses an action with an input over HTTP', async () => {
      app = await startRealtimeServer();
      createRealtimeAction({
        name: 'voice',
        payload: Type.Object({ prompt: Type.String() }),
        input: {},
        handler: () => undefined
      });

      const response = await streamCall('voice');

      expect(response.status).toBe(400);
      expect((await response.json()).code).toBe('REALTIME_MESSAGE_INVALID');
    });

    test('sends a stream to its subscribers over SSE and the WebSocket', async () => {
      app = await startRealtimeServer();
      const radio = createStream({ name: 'radio', codec: 'binary' });
      const socket = await connect();
      socket.send({
        type: 'subscribe',
        id: 'r',
        channel: 'stream:radio',
        key: 'jazz'
      });
      await socket.next((m) => m.type === 'subscribed');
      const subscriptions = encodeURIComponent(
        JSON.stringify([{ id: 'r', channel: 'stream:radio', key: 'jazz' }])
      );
      const events = await openEventStream(
        `${app.url}/events?ticket=${await ticket()}&subscriptions=${subscriptions}`
      );
      await events.next((m) => m.type === 'subscribed');

      const writer = radio.open('jazz');
      writer.write(new Uint8Array([1, 2, 3]), { sync: true });
      writer.end();
      const viaSocket = await socket.next((m) => m.type === 'chunk');
      const viaEvents = await events.next((m) => m.type === 'chunk');
      events.abort();

      expect(viaSocket).toEqual({
        type: 'chunk',
        sid: expect.any(Number),
        seq: 0,
        data: 'AQID',
        sync: true
      });
      expect(viaEvents).toEqual(viaSocket);
    });
  });

  describe('disabled transports', () => {
    test('answers the route of a disabled transport', async () => {
      configOverrides.REALTIME_SSE_ENABLED = false;
      configOverrides.REALTIME_WEBSOCKET_ENABLED = false;
      app = await startRealtimeServer();

      const responses = await Promise.all(
        ['events', 'ws'].map((path) => fetch(`${app.url}/${path}`))
      );

      expect(responses.map((r) => r.status)).toEqual([404, 404]);
      expect(
        await Promise.all(responses.map(async (r) => (await r.json()).details))
      ).toEqual([{ transport: 'sse' }, { transport: 'websocket' }]);
    });
  });

  describe('anonymous connections', () => {
    test('limits the anonymous connections of an IP address', async () => {
      configOverrides.REALTIME_ANONYMOUS_ENABLED = true;
      configOverrides.REALTIME_MAX_ANONYMOUS_CONNECTIONS_PER_IP = 1;
      app = await startRealtimeServer();

      const first = await TestSocket.open(`${app.ws}/ws`);
      sockets.push(first);
      await first.next((m) => m.type === 'welcome');
      const second = await TestSocket.open(`${app.ws}/ws`);
      sockets.push(second);
      const error = await second.next((m) => m.type === 'error');
      const authenticated = await connect();

      expect(error.error).toMatchObject({
        code: 'REALTIME_CONNECTION_LIMIT',
        details: { limit: 1 }
      });
      expect(authenticated.messages[0].type).toBe('welcome');
    });
  });

  describe('ticket redemption', () => {
    /** Delays the redemptions, and returns a promise settled once the first one has been handled by its route. */
    const delayRedeem = () => {
      const redeem = TicketService.prototype.redeem;
      let redeemed!: Promise<unknown>;
      jest
        .spyOn(TicketService.prototype, 'redeem')
        .mockImplementation(function (this: TicketService, ticket) {
          redeemed = new Promise((resolve) => setTimeout(resolve, 150)).then(
            () => redeem.call(this, ticket)
          );
          return redeemed as ReturnType<typeof redeem>;
        });
      return async () => {
        await until(() => redeemed !== undefined);
        await redeemed.catch(() => undefined);
        await new Promise((resolve) => setImmediate(resolve));
      };
    };

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('handles the messages a client sends before its ticket is redeemed', async () => {
      app = await startRealtimeServer();
      createChannel({ name: 'news', payload: Type.Object({}) });
      delayRedeem();

      const socket = await TestSocket.open(
        `${app.ws}/ws?ticket=${await ticket()}`
      );
      sockets.push(socket);
      socket.send({ type: 'subscribe', id: 'n', channel: 'news' });

      expect(await socket.next((m) => m.id === 'n')).toEqual({
        type: 'subscribed',
        id: 'n'
      });
    });

    test('opens no WebSocket connection of a client leaving meanwhile', async () => {
      app = await startRealtimeServer();
      const redeemed = delayRedeem();

      const socket = await TestSocket.open(
        `${app.ws}/ws?ticket=${await ticket()}`
      );
      socket.close();
      await redeemed();

      expect(app.gateway.connections.size).toBe(0);
    });

    test('opens no event stream of a client leaving meanwhile', async () => {
      app = await startRealtimeServer();
      const redeemed = delayRedeem();
      const controller = new AbortController();

      const request = fetch(`${app.url}/events?ticket=${await ticket()}`, {
        signal: controller.signal
      }).catch(() => undefined);
      await until(
        () => jest.mocked(TicketService.prototype.redeem).mock.calls.length > 0
      );
      controller.abort();
      await request;
      await redeemed();

      expect(app.gateway.connections.size).toBe(0);
    });

    test('closes a WebSocket sending a binary message', async () => {
      app = await startRealtimeServer();
      const socket = await connect();

      socket.socket.send(new Uint8Array([1, 2]));
      await socket.next(() => false).catch(() => undefined);

      expect(socket.closeCode).toBe(1008);
    });
  });
});
