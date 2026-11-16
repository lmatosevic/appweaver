import { Type } from '@sinclair/typebox';
import {
  FetchClient,
  ClientConfig,
  RealtimeClientOptions
} from '@appweaver/client';
import { configOverrides, Events } from '@appweaver/common';
import { inject } from '@appweaver/core';
import { context } from '@appweaver/core/internal';
import { createModel } from '@appweaver/data';
import { linkModels, resetContext } from '@appweaver/testing';
import { createRealtimeAction } from '../../action';
import { createChannel } from '../../channel';
import { Channel, RealtimeCloseCode } from '../../types';
import {
  RealtimeServer,
  startRealtimeServer
} from '../fixtures/realtime-server';

type Realtime = {
  channels: {
    news: { payload: { title: string }; params: { topic?: string } };
  };
  resources: { Post: { actions: 'create' | 'update'; record: { id: number } } };
  actions: {
    double: { payload: { a: number }; response: { double: number } };
    note: { payload: { text: string }; response: void };
  };
};

class TestClient extends FetchClient {
  public realtime = this.realtimeClient<Realtime>('/api/realtime');
}

const user = { id: 1, email: 'user@test.com', enabled: true, roles: [] };

const waitFor = async (check: () => boolean, timeout = 2000) => {
  const deadline = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('Condition not met');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

describe('RealtimeClient', () => {
  let app: RealtimeServer;
  let client: TestClient;
  let news: Channel;
  let notes: string[];

  const createClient = (realtime: RealtimeClientOptions = {}) => {
    const config: ClientConfig = {
      baseUrl: app.url.replace('/api/realtime', ''),
      middlewares: [
        {
          onRequest: ({ request }) => {
            request.headers.set('x-user', JSON.stringify(user));
            request.headers.set('authorization', 'Bearer test');
            return request;
          }
        }
      ],
      realtime: { reconnectDelay: 50, ...realtime }
    };
    return new TestClient(config);
  };

  beforeEach(async () => {
    resetContext();
    notes = [];
    createModel({ name: 'Post', scalars: { title: { type: 'string' } } });
    linkModels();
    context.resource.routes.set('Post', {
      config: { modelName: 'Post', events: { actions: ['create', 'update'] } },
      basePath: 'posts',
      handler: () => undefined
    } as never);
    context.resource.services.set('Post', {
      checkEventAccess: async () => true
    } as never);
    news = createChannel({
      name: 'news',
      payload: Type.Object({ title: Type.String() }),
      params: Type.Object({ topic: Type.Optional(Type.String()) })
    });
    createRealtimeAction({
      name: 'double',
      payload: Type.Object({ a: Type.Integer() }),
      handler: ({ a }) => ({ double: a * 2 })
    });
    createRealtimeAction({
      name: 'note',
      payload: Type.Object({ text: Type.String() }),
      handler: ({ text }) => {
        notes.push(text);
      }
    });
    app = await startRealtimeServer();
    await app.gateway.onReady();
  });

  afterEach(async () => {
    client?.realtime.disconnect();
    await app.close();
  });

  describe.each(['websocket', 'sse'] as const)('over %s', (transport) => {
    beforeEach(() => {
      client = createClient({ transport });
    });

    test('receives the events of its subscriptions', async () => {
      const received: unknown[] = [];
      const subscription = client.realtime.subscribe('news', (payload, meta) =>
        received.push([payload, meta.channel])
      );
      const posts: unknown[] = [];
      const postSubscription = client.realtime.on(
        'Post',
        (event) => posts.push([event.action, event.current]),
        { action: 'update' }
      );

      await Promise.all([subscription.ready, postSubscription.ready]);
      await news.publish({ title: 'Hello' });
      inject(Events).emitResourceEvent('Post', 'create', {
        current: { id: 1, title: 'A' }
      });
      inject(Events).emitResourceEvent('Post', 'update', {
        current: { id: 1, title: 'B' }
      });
      await waitFor(() => received.length === 1 && posts.length === 1);

      expect(client.realtime.transport).toBe(transport);
      expect(client.realtime.state).toBe('open');
      expect(received).toEqual([[{ title: 'Hello' }, 'news']]);
      expect(posts).toEqual([['update', { id: 1, title: 'B' }]]);
    });

    test('stops receiving after unsubscribing', async () => {
      const received: unknown[] = [];
      const subscription = client.realtime.subscribe('news', (payload) =>
        received.push(payload)
      );
      const kept = client.realtime.subscribe('news', () => undefined);
      await Promise.all([subscription.ready, kept.ready]);

      subscription.unsubscribe();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await news.publish({ title: 'Ignored' });
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(received).toEqual([]);
    });

    test('rejects a refused subscription', async () => {
      const errors: string[] = [];
      client.realtime.onError((e) => errors.push(e.code));

      const subscription = client.realtime.subscribe(
        'missing' as 'news',
        () => undefined
      );

      await expect(subscription.ready).rejects.toMatchObject({
        status: 404,
        code: 'REALTIME_CHANNEL_UNKNOWN'
      });
      expect(errors).toContain('REALTIME_CHANNEL_UNKNOWN');
    });

    test('calls the actions with and without their results', async () => {
      const result = await client.realtime.send('double', { a: 21 });
      client.realtime.emit('note', { text: 'hello' });
      await waitFor(() => notes.length === 1);

      expect(result).toEqual({ double: 42 });
      expect(notes).toEqual(['hello']);
      await expect(
        client.realtime.send('double', { a: 'x' as never })
      ).rejects.toMatchObject({ code: 'REALTIME_PAYLOAD_INVALID' });
    });

    test('reconnects with its subscriptions', async () => {
      const received: unknown[] = [];
      const states: string[] = [];
      client.realtime.onStateChange((state) => states.push(state));
      await client.realtime.subscribe('news', (payload) =>
        received.push(payload)
      ).ready;
      const first = client.realtime.connectionId;

      app.gateway.closeAll(RealtimeCloseCode.Reauthenticate, 'Expired');
      await waitFor(
        () =>
          client.realtime.state === 'open' &&
          client.realtime.connectionId !== first &&
          app.gateway.connections.size === 1 &&
          [...app.gateway.connections.values()][0].subscriptions.size === 1
      );
      await news.publish({ title: 'Again' });
      await waitFor(() => received.length === 1);

      expect(states).toContain('reconnecting');
      expect(received).toEqual([{ title: 'Again' }]);
    });
  });

  test('observes a channel', async () => {
    client = createClient();
    const received: unknown[] = [];

    const subscription = client.realtime
      .observe('news', { topic: 'a' })
      .subscribe({ next: (payload) => received.push(payload) });
    await waitFor(
      () => [...app.gateway.connections.values()][0]?.subscriptions.size === 1
    );
    await news.publish({ title: 'Observed' });
    await waitFor(() => received.length === 1);
    subscription.unsubscribe();

    expect(received).toEqual([{ title: 'Observed' }]);
  });

  test('reports a refused ticket', async () => {
    client = new TestClient({
      baseUrl: app.url.replace('/api/realtime', ''),
      realtime: { reconnect: false }
    });

    await expect(client.realtime.connect()).rejects.toMatchObject({
      status: 401
    });
  });

  test('rejects the pending actions when disconnected', async () => {
    createRealtimeAction({
      name: 'slow',
      payload: Type.Object({}),
      handler: () => new Promise((resolve) => setTimeout(resolve, 1000))
    });
    client = createClient();
    await client.realtime.connect();

    const pending = client.realtime.send('slow' as 'double', {} as never);
    await new Promise((resolve) => setTimeout(resolve, 50));
    client.realtime.disconnect();

    await expect(pending).rejects.toMatchObject({ code: 'REQUEST_FAILED' });
    expect(client.realtime.state).toBe('idle');
  });

  describe('anonymous connections', () => {
    beforeEach(() => {
      configOverrides.REALTIME_ANONYMOUS_ENABLED = true;
      createChannel({
        name: 'prices',
        payload: Type.Object({ price: Type.Number() }),
        public: true
      });
    });

    afterEach(() => {
      delete configOverrides.REALTIME_ANONYMOUS_ENABLED;
    });

    test('connects anonymously until the user logs in', async () => {
      let loggedIn = false;
      client = new TestClient({
        baseUrl: app.url.replace('/api/realtime', ''),
        middlewares: [
          {
            onRequest: ({ request }) => {
              if (loggedIn) {
                request.headers.set('x-user', JSON.stringify(user));
                request.headers.set('authorization', 'Bearer test');
              }
              return request;
            }
          }
        ],
        realtime: { anonymous: 'auto' }
      });
      const prices: unknown[] = [];

      await client.realtime.subscribe('prices' as 'news', (payload) =>
        prices.push(payload)
      ).ready;
      const anonymous = client.realtime.authenticated;
      const denied = client.realtime.subscribe('news', () => undefined).ready;
      await expect(denied).rejects.toMatchObject({
        code: 'REALTIME_SUBSCRIPTION_DENIED'
      });

      loggedIn = true;
      await client.realtime.reconnect();
      await client.realtime.subscribe('news', () => undefined).ready;
      const connection = [...app.gateway.connections.values()][0];

      expect(anonymous).toBe(false);
      expect(client.realtime.authenticated).toBe(true);
      expect(app.gateway.connections.size).toBe(1);
      expect(connection.user).toMatchObject({ id: 1 });
      expect(connection.subscriptions.size).toBe(2);
    });

    test('fails to connect when the ticket is refused otherwise', async () => {
      client = new TestClient({
        baseUrl: app.url.replace('/api/realtime', ''),
        realtime: { reconnect: false }
      });

      await expect(client.realtime.connect()).rejects.toMatchObject({
        status: 401
      });
      expect(client.realtime.authenticated).toBe(false);
    });

    test('fails on a refused ticket of another status', async () => {
      client = new TestClient({
        baseUrl: 'http://127.0.0.1:1',
        realtime: { anonymous: 'auto', reconnect: false }
      });

      await expect(client.realtime.connect()).rejects.toBeDefined();
    });
  });

  describe.each(['websocket', 'sse'] as const)(
    'recovery over %s',
    (transport) => {
      test('retries a connection failing for a while', async () => {
        let failures = 1;
        const errors: string[] = [];
        client = new TestClient({
          baseUrl: app.url.replace('/api/realtime', ''),
          fetch: (input, init) => {
            if (failures > 0) {
              failures--;
              return Promise.reject(new TypeError('Network down'));
            }
            const request = new Request(input, init);
            request.headers.set('x-user', JSON.stringify(user));
            request.headers.set('authorization', 'Bearer test');
            return fetch(request);
          },
          realtime: { transport, reconnectDelay: 20 }
        });
        client.realtime.onError((e) => errors.push(e.message));

        await client.realtime.subscribe('news', () => undefined).ready;

        expect(client.realtime.state).toBe('open');
        expect(errors).toEqual(['Network down']);
      });

      test('fails the subscriptions of a refused connection', async () => {
        client = new TestClient({
          baseUrl: app.url.replace('/api/realtime', ''),
          fetch: async () =>
            new Response(
              JSON.stringify({
                status: 404,
                code: 'REALTIME_TRANSPORT_DISABLED'
              }),
              { status: 404 }
            ),
          realtime: { transport, reconnectDelay: 20 }
        });

        const subscription = client.realtime.subscribe('news', () => undefined);

        await expect(subscription.ready).rejects.toMatchObject({
          status: 404
        });
        expect(client.realtime.state).toBe('idle');
      });
    }
  );
});
