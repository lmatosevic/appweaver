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
});
