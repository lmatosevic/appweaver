import { Type } from '@sinclair/typebox';
import { configOverrides, ErrorCode, PubSub } from '@appweaver/common';
import { define } from '@appweaver/core';
import { MemoryPubSub } from '@appweaver/core/drivers';
import {
  recordTelemetry,
  resetContext,
  TelemetryRecorder
} from '@appweaver/testing';
import { createStream } from '../../stream/create-stream';
import { StreamHub } from '../../stream/stream-hub';
import { streamSettings } from '../../stream/stream-instance';
import { Stream } from '../../stream/types';
import { FakeSink } from '../fixtures/fake-sink';

/** Lets the pub/sub deliver its messages, sent on the next turns of the event loop. */
const settle = async (turns = 3) => {
  for (let i = 0; i < turns; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('stream-hub', () => {
  let pubsub: MemoryPubSub;
  let hubs: StreamHub[];
  let answer: Stream;

  const createHub = async () => {
    const hub = new StreamHub();
    await hub.onReady();
    hubs.push(hub);
    return hub;
  };

  const dataPublishes = (spy: jest.SpyInstance) =>
    spy.mock.calls.filter(([channel]) =>
      String(channel).startsWith('realtime:stream:')
    );

  beforeEach(() => {
    resetContext();
    pubsub = new MemoryPubSub();
    define(pubsub, PubSub);
    hubs = [];
    answer = createStream({ name: 'answer' });
    configOverrides.REALTIME_STREAM_RELAY_FLUSH_INTERVAL = 5;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    for (const hub of hubs) {
      await hub.onDestroy();
    }
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  describe('StreamHub', () => {
    test('sends a stream to the subscribers of its key, without the pub/sub', async () => {
      const hub = await createHub();
      define(hub, StreamHub);
      const sink = new FakeSink();
      const other = new FakeSink();
      await hub.subscribe(answer, 'room-1', sink);
      await hub.subscribe(answer, 'room-2', other);
      await settle();
      const publish = jest.spyOn(pubsub, 'publish');

      const writer = answer.open('room-1');
      writer.write('Hello');
      writer.end({ done: true });
      await settle();

      expect(sink.starts).toEqual([
        expect.objectContaining({
          name: 'answer',
          key: 'room-1',
          streamId: writer.streamId,
          seq: 0
        })
      ]);
      expect(sink.messages.map((message) => message.type)).toEqual([
        'chunk',
        'stream.end'
      ]);
      expect(other.frames).toEqual([]);
      expect(dataPublishes(publish)).toEqual([]);
      expect(writer).toMatchObject({
        name: 'answer',
        key: 'room-1',
        ended: true,
        subscribers: 0
      });
      expect(writer.signal.aborted).toBe(true);
      await expect(writer.ready).resolves.toBeUndefined();
    });

    test('attaches a subscriber to the open streams of its key', async () => {
      const hub = await createHub();
      const writer = hub.open(answer, '');
      writer.write('a');
      const sink = new FakeSink();

      await hub.subscribe(answer, '', sink);
      writer.write('b');

      expect(sink.chunks).toEqual(['a', 'b']);
      expect(writer.subscribers).toBe(1);
      writer.error(new Error('failed'));
      expect(sink.messages[2]).toMatchObject({ type: 'stream.error' });
    });

    test('relays a stream to an instance with a subscriber of its key, in batches', async () => {
      const owner = await createHub();
      const remote = await createHub();
      const sink = new FakeSink();
      await remote.subscribe(answer, 'room', sink);
      await settle();
      const publish = jest.spyOn(pubsub, 'publish');

      const writer = owner.open(answer, 'room');
      expect(writer.subscribers).toBe(1);
      writer.write('a');
      writer.write('b');
      writer.write('c');
      await wait(20);
      await settle();
      writer.end('result');
      await settle();

      expect(sink.starts).toEqual([
        expect.objectContaining({ streamId: writer.streamId, seq: 0 })
      ]);
      expect(sink.chunks).toEqual(['a', 'b', 'c']);
      expect(sink.messages.at(-1)).toMatchObject({
        type: 'stream.end',
        seq: 3,
        result: 'result'
      });
      // The start, one batch of the three chunks, the end
      expect(dataPublishes(publish)).toHaveLength(3);
    });

    test('flushes a relay batch once it is large', async () => {
      configOverrides.REALTIME_STREAM_RELAY_FLUSH_INTERVAL = 10000;
      configOverrides.REALTIME_STREAM_RELAY_MAX_BATCH = '100B';
      const owner = await createHub();
      const remote = await createHub();
      const sink = new FakeSink();
      await remote.subscribe(answer, '', sink);
      await settle();

      const writer = owner.open(answer, '');
      await settle();
      writer.write('x'.repeat(200));
      await settle();

      expect(sink.chunks).toEqual(['x'.repeat(200)]);
    });

    test('relays every chunk at once without a flush interval', async () => {
      configOverrides.REALTIME_STREAM_RELAY_FLUSH_INTERVAL = 0;
      const owner = await createHub();
      const remote = await createHub();
      const sink = new FakeSink();
      await remote.subscribe(answer, '', sink);
      await settle();

      const writer = owner.open(answer, '');
      writer.write('a', { sync: true });
      await settle();

      expect(sink.messages).toEqual([
        expect.objectContaining({ type: 'chunk', data: 'a', sync: true })
      ]);
    });

    test('sends the chunks kept to an instance subscribing late', async () => {
      const owner = await createHub();
      const remote = await createHub();
      const writer = owner.open(answer, '');
      writer.write('a');
      writer.write('b');

      const sink = new FakeSink();
      await remote.subscribe(answer, '', sink);
      await settle();
      writer.write('c');
      await wait(20);
      await settle();

      expect(sink.chunks).toEqual(['a', 'b', 'c']);
      expect(sink.starts[0].seq).toBe(0);

      // A second subscriber of the instance uses its mirror
      const second = new FakeSink();
      await remote.subscribe(answer, '', second);
      expect(second.chunks).toEqual(['a', 'b', 'c']);
    });

    test('stops relaying once the last remote subscriber left', async () => {
      const owner = await createHub();
      const remote = await createHub();
      const sink = new FakeSink();
      await remote.subscribe(answer, '', sink);
      await settle();
      const writer = owner.open(answer, '');
      await settle();

      await remote.unsubscribe('answer', '', sink);
      await remote.unsubscribe('answer', '', sink);
      await settle();
      const publish = jest.spyOn(pubsub, 'publish');
      writer.write('a');
      await wait(20);

      expect(writer.subscribers).toBe(0);
      expect(owner.interestedInstances('answer', '')).toBe(0);
      expect(dataPublishes(publish)).toEqual([]);
    });

    test('resumes a stream of a key from a sequence number', async () => {
      const hub = await createHub();
      const writer = hub.open(answer, '');
      writer.write('a');
      writer.write('b');
      writer.end();
      const resumed = new FakeSink();
      const fresh = new FakeSink();

      await hub.subscribe(answer, '', resumed, {
        streamId: writer.streamId,
        seq: 1
      });
      await hub.subscribe(answer, '', fresh);

      expect(resumed.chunks).toEqual(['b']);
      expect(resumed.finished).toHaveLength(1);
      expect(fresh.frames).toEqual([]);
    });

    test('resumes a relayed stream once its owner sends it', async () => {
      const owner = await createHub();
      const remote = await createHub();
      const writer = owner.open(answer, '');
      writer.write('a');
      writer.write('b');

      const sink = new FakeSink();
      await remote.subscribe(answer, '', sink, {
        streamId: writer.streamId,
        seq: 1
      });
      await settle();

      expect(sink.chunks).toEqual(['b']);
    });

    test('loses a relayed stream whose owner went silent', async () => {
      configOverrides.REALTIME_STREAM_RELAY_HEARTBEAT = 100;
      const owner = await createHub();
      const remote = await createHub();
      const sink = new FakeSink();
      await remote.subscribe(answer, '', sink);
      await settle();
      owner.open(answer, '');
      await settle();
      expect(sink.starts).toHaveLength(1);

      // The owner stops answering
      jest.spyOn(owner, 'heartbeat').mockImplementation(() => undefined);
      await owner.onDestroy();
      hubs.splice(hubs.indexOf(owner), 1);
      await settle();
      expect(sink.messages.at(-1)).toMatchObject({
        type: 'stream.error',
        error: expect.objectContaining({ code: ErrorCode.RealtimeStreamLost })
      });

      // A new instance learns the interest of the others when it starts
      const silent = await createHub();
      jest.spyOn(silent, 'heartbeat').mockImplementation(() => undefined);
      await settle();
      expect(silent.interestedInstances('answer', '')).toBe(1);
      silent.open(answer, '');
      await settle();
      expect(sink.starts).toHaveLength(2);

      await wait(350);
      remote.heartbeat();

      expect(sink.messages.at(-1)).toMatchObject({
        type: 'stream.error',
        sid: sink.starts[1].sid,
        error: expect.objectContaining({ code: ErrorCode.RealtimeStreamLost })
      });
    });

    test('keeps a relayed stream alive with the heartbeats', async () => {
      configOverrides.REALTIME_STREAM_RELAY_HEARTBEAT = 100;
      const owner = await createHub();
      const remote = await createHub();
      const sink = new FakeSink();
      await remote.subscribe(answer, '', sink);
      await settle();
      const writer = owner.open(answer, '');
      await settle();

      for (let i = 0; i < 5; i++) {
        await wait(100);
        owner.heartbeat();
        await settle();
      }
      remote.heartbeat();

      expect(writer.subscribers).toBe(1);
      expect(sink.messages).toEqual([]);
    });

    test('forgets the interest of an instance gone silent', async () => {
      configOverrides.REALTIME_STREAM_RELAY_HEARTBEAT = 100;
      const owner = await createHub();
      const remote = await createHub();
      await remote.subscribe(answer, '', new FakeSink());
      await settle();
      expect(owner.interestedInstances('answer', '')).toBe(1);

      jest.spyOn(remote, 'heartbeat').mockImplementation(() => undefined);
      await wait(350);
      owner.heartbeat();

      expect(owner.interestedInstances('answer', '')).toBe(0);
    });

    test('ignores the control messages of its own and the invalid ones', async () => {
      const hub = await createHub();
      hub.receiveControl({
        op: 'interest',
        from: hub.instanceId,
        topics: [['answer', '']]
      });
      hub.receiveControl({ op: 'interest', from: 'x', topics: 'x' } as never);

      expect(hub.interestedInstances('answer', '')).toBe(0);
    });

    test('ends the streams it owns on shutdown', async () => {
      const hub = await createHub();
      const sink = new FakeSink();
      await hub.subscribe(answer, '', sink);
      const writer = hub.open(answer, '');

      await hub.onDestroy();
      hubs.splice(hubs.indexOf(hub), 1);

      expect(writer.ended).toBe(true);
      expect(sink.messages).toEqual([
        expect.objectContaining({
          type: 'stream.error',
          error: expect.objectContaining({ code: ErrorCode.RealtimeStreamLost })
        })
      ]);
    });

    test('fails a subscription the pub/sub refuses', async () => {
      const hub = await createHub();
      jest.spyOn(pubsub, 'subscribe').mockRejectedValueOnce(new Error('down'));

      await expect(hub.subscribe(answer, '', new FakeSink())).rejects.toThrow(
        'down'
      );
    });

    describe('action streams', () => {
      test('resumes the stream of its caller only', async () => {
        const hub = await createHub();
        const instance = hub.openAction('assistant', streamSettings({}), '1');
        const sink = new FakeSink();
        instance.attach(sink);
        instance.write('a');
        instance.write('b');
        instance.detach(sink);

        const resumed = new FakeSink();
        expect(hub.resumeAction(instance.streamId, '1', resumed, 1)).toBe(
          instance
        );
        expect(resumed.chunks).toEqual(['b']);
        expect(() =>
          hub.resumeAction(instance.streamId, '2', new FakeSink(), 0)
        ).toThrow(
          expect.objectContaining({ code: ErrorCode.RealtimeStreamNotFound })
        );
        expect(() => hub.resumeAction('x', '1', new FakeSink(), 0)).toThrow(
          expect.objectContaining({ code: ErrorCode.RealtimeStreamNotFound })
        );
      });

      test('cancels a stream left without its caller for the linger', async () => {
        configOverrides.REALTIME_STREAM_LINGER = 20;
        const hub = await createHub();
        const instance = hub.openAction('assistant', streamSettings({}), null);
        const sink = new FakeSink();
        instance.attach(sink);

        instance.detach(sink);
        await wait(40);

        expect(instance.ended).toBe(true);
        expect(instance.endEntry?.frame.message).toMatchObject({
          cancelled: true
        });
        await wait(40);
        expect(() =>
          hub.resumeAction(instance.streamId, null, new FakeSink(), 0)
        ).toThrow(
          expect.objectContaining({ code: ErrorCode.RealtimeStreamNotFound })
        );
      });

      test('keeps an ended stream resumable for the linger', async () => {
        configOverrides.REALTIME_STREAM_LINGER = 20;
        const hub = await createHub();
        const instance = hub.openAction('assistant', streamSettings({}), null);
        instance.write('a');
        instance.end();

        const sink = new FakeSink();
        hub.resumeAction(instance.streamId, null, sink, 0);
        expect(sink.chunks).toEqual(['a']);
        expect(sink.finished).toHaveLength(1);

        await wait(40);
        expect(() =>
          hub.resumeAction(instance.streamId, null, new FakeSink(), 0)
        ).toThrow(
          expect.objectContaining({ code: ErrorCode.RealtimeStreamNotFound })
        );
      });

      test('ends the action streams on shutdown', async () => {
        const hub = await createHub();
        const instance = hub.openAction('assistant', streamSettings({}), null);

        await hub.onDestroy();
        hubs.splice(hubs.indexOf(hub), 1);

        expect(instance.endEntry?.frame.message.type).toBe('stream.error');
      });
    });

    describe('telemetry', () => {
      let telemetry: TelemetryRecorder;

      beforeEach(() => {
        telemetry = recordTelemetry();
      });

      afterEach(async () => {
        await telemetry.stop();
      });

      test('traces a stream and measures its chunks', async () => {
        const hub = await createHub();
        const writer = hub.open(answer, '');
        writer.write('ab');
        writer.end();
        const failed = hub.open(answer, '');
        failed.error(new Error('failed'));

        const span = telemetry.span('realtime stream answer');
        expect(span.attributes).toMatchObject({
          'appweaver.realtime.stream': 'answer',
          'appweaver.realtime.stream.id': writer.streamId,
          'appweaver.realtime.stream.chunks': 1
        });
        expect(telemetry.spans()[1].status.code).toBe(2);
        expect(
          (await telemetry.metric('appweaver.realtime.stream.chunks'))
            ?.dataPoints[0].value
        ).toBe(1);
        expect(
          (await telemetry.metric('appweaver.realtime.streams'))?.dataPoints[0]
            .value
        ).toBe(0);
      });

      test('records nothing with the instrumentation off', async () => {
        configOverrides.TELEMETRY_INSTRUMENTATIONS_REALTIME = false;
        const hub = await createHub();
        hub.open(answer, '').end();

        expect(telemetry.spans()).toEqual([]);
      });
    });
  });

  describe('createStream', () => {
    test('validates the chunks of its json codec', async () => {
      const ticks = createStream({
        name: 'ticks',
        codec: 'json',
        chunk: Type.Object({ price: Type.Number() })
      });
      const hub = await createHub();
      define(hub, StreamHub);

      const writer = ticks.open();

      expect(writer.key).toBe('');
      expect(() => writer.write({ price: 'x' } as never)).toThrow(
        expect.objectContaining({ code: ErrorCode.RealtimePayloadInvalid })
      );
    });
  });
});
