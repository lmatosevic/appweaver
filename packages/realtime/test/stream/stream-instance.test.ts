import { Type } from '@sinclair/typebox';
import { configOverrides, ErrorCode, RealtimeError } from '@appweaver/common';
import { StreamInstance, streamSettings } from '../../stream/stream-instance';
import { StreamOptions } from '../../stream/types';
import { FakeSink } from '../fixtures/fake-sink';

const create = (options: StreamOptions = {}, hooks = {}, seq?: number) =>
  new StreamInstance(
    1,
    'stream-1',
    'answer',
    'room-1',
    streamSettings(options),
    hooks,
    seq
  );

describe('stream-instance', () => {
  afterEach(() => {
    jest.useRealTimers();
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  describe('streamSettings', () => {
    test('defaults to a text stream replaying every chunk kept', () => {
      expect(streamSettings()).toEqual({
        codec: 'text',
        replayFrom: 'all',
        onSlow: 'close',
        coalesce: 0
      });
    });

    test('reads the options, never coalescing a json stream', () => {
      const chunk = Type.Object({});

      expect(
        streamSettings({
          codec: 'json',
          chunk,
          mimeType: 'application/json',
          replay: { from: 'sync', maxBytes: '1KB' },
          onSlow: 'drop',
          coalesce: 10
        })
      ).toEqual({
        codec: 'json',
        chunk,
        mimeType: 'application/json',
        replayFrom: 'sync',
        replayBytes: 1024,
        onSlow: 'drop',
        coalesce: 0
      });
    });
  });

  describe('StreamInstance', () => {
    test('sends the chunks to every subscriber, encoded once', () => {
      const instance = create();
      const first = new FakeSink();
      const second = new FakeSink();
      instance.attach(first);
      instance.attach(second);

      instance.write('Hello');
      instance.write(' world', { sync: true });

      expect(first.starts).toEqual([
        {
          sid: 1,
          streamId: 'stream-1',
          name: 'answer',
          key: 'room-1',
          codec: 'text',
          seq: 0
        }
      ]);
      expect(first.messages).toEqual([
        { type: 'chunk', sid: 1, seq: 0, data: 'Hello' },
        { type: 'chunk', sid: 1, seq: 1, data: ' world', sync: true }
      ]);
      expect(second.frames[0]).toBe(first.frames[0]);
      expect(first.frames[0].json).toBe(
        '{"type":"chunk","sid":1,"seq":0,"data":"Hello"}'
      );
      expect(first.frames[0].sse).toBe(`data: ${first.frames[0].json}\n\n`);
    });

    test('encodes the bytes of a binary stream as base64', () => {
      const instance = create({ codec: 'binary', mimeType: 'audio/mpeg' });
      const sink = new FakeSink();
      instance.attach(sink);

      instance.write(new Uint8Array([1, 2, 3]));

      expect(sink.starts[0].mimeType).toBe('audio/mpeg');
      expect(sink.chunks).toEqual(['AQID']);
    });

    test('checks the chunks of a json stream outside of prod', () => {
      const instance = create({
        codec: 'json',
        chunk: Type.Object({ price: Type.Number() })
      });
      const sink = new FakeSink();
      instance.attach(sink);

      instance.write({ price: 1 });
      expect(() => instance.write({ price: 'x' })).toThrow(
        expect.objectContaining({ code: ErrorCode.RealtimePayloadInvalid })
      );

      configOverrides.APP_ENV = 'prod';
      instance.write({ price: 'x' });

      expect(sink.chunks).toEqual([{ price: 1 }, { price: 'x' }]);
    });

    test('refuses a chunk of another codec', () => {
      expect(() => create().write(1)).toThrow(
        expect.objectContaining({ code: ErrorCode.RealtimePayloadInvalid })
      );
      expect(() => create({ codec: 'binary' }).write('a')).toThrow(
        expect.objectContaining({ code: ErrorCode.RealtimePayloadInvalid })
      );
      expect(() => create({ codec: 'json' }).write(undefined)).toThrow(
        expect.objectContaining({ code: ErrorCode.RealtimePayloadInvalid })
      );
    });

    test('merges the chunks written within the coalesce interval', () => {
      jest.useFakeTimers();
      const instance = create({ coalesce: 20 });
      const sink = new FakeSink();
      instance.attach(sink);

      instance.write('a');
      instance.write('b');
      expect(sink.chunks).toEqual([]);

      jest.advanceTimersByTime(20);
      instance.write('c');
      instance.write('d', { sync: true });
      instance.write('e');
      jest.advanceTimersByTime(20);

      expect(sink.messages).toEqual([
        { type: 'chunk', sid: 1, seq: 0, data: 'ab' },
        { type: 'chunk', sid: 1, seq: 1, data: 'c' },
        { type: 'chunk', sid: 1, seq: 2, data: 'de', sync: true }
      ]);
    });

    test('flushes a coalesced chunk once it is large, and merges the bytes', () => {
      jest.useFakeTimers();
      const text = create({ coalesce: 1000 });
      const bytes = create({ codec: 'binary', coalesce: 1000 });
      const textSink = new FakeSink();
      const bytesSink = new FakeSink();
      text.attach(textSink);
      bytes.attach(bytesSink);

      text.write('x'.repeat(64 * 1024));
      bytes.write(new Uint8Array([1]));
      bytes.write(new Uint8Array([2, 3]));
      bytes.end();

      expect(textSink.chunks).toEqual(['x'.repeat(64 * 1024)]);
      expect(bytesSink.chunks).toEqual(['AQID']);
    });

    test('replays the chunks kept to a late subscriber', () => {
      const all = create();
      const sync = create({ replay: { from: 'sync' } });
      const none = create({ replay: { from: 'none' } });
      for (const instance of [all, sync, none]) {
        instance.write('a', { sync: true });
        instance.write('b');
        instance.write('c', { sync: true });
        instance.write('d');
      }
      const sinks = [new FakeSink(), new FakeSink(), new FakeSink()];

      all.attach(sinks[0]);
      sync.attach(sinks[1]);
      none.attach(sinks[2]);

      expect(sinks.map((sink) => sink.chunks)).toEqual([
        ['a', 'b', 'c', 'd'],
        ['c', 'd'],
        []
      ]);
      expect(sinks.map((sink) => sink.starts[0].seq)).toEqual([0, 2, 4]);
    });

    test('replays nothing of a sync replay without a sync chunk', () => {
      const instance = create({ replay: { from: 'sync' } });
      instance.write('a');
      const sink = new FakeSink();

      instance.attach(sink);

      expect(sink.chunks).toEqual([]);
    });

    test('keeps the last chunks up to the replay limit', () => {
      configOverrides.REALTIME_STREAM_REPLAY_LIMIT = '100B';
      const instance = create();
      for (let i = 0; i < 5; i++) {
        instance.write(String(i).repeat(20));
      }

      expect(instance.ring.map((entry) => entry.seq)).toEqual([4]);
    });

    test('resumes a subscriber from a sequence number', () => {
      const instance = create({ replay: { from: 'none', maxBytes: '150B' } });
      instance.write('a'.repeat(50));
      instance.write('b'.repeat(50));
      instance.write('c'.repeat(50));
      const kept = new FakeSink();
      const evicted = new FakeSink();
      const ahead = new FakeSink();

      instance.attach(kept, 2);
      instance.attach(evicted, 0);
      instance.attach(ahead, 5);

      expect(kept.chunks).toEqual(['c'.repeat(50)]);
      expect(evicted.gaps).toEqual([[1, 0, 2]]);
      expect(evicted.chunks).toEqual(['c'.repeat(50)]);
      expect(ahead.chunks).toEqual([]);
      expect(ahead.starts[0].seq).toBe(3);
    });

    test('closes a subscriber reading too slowly', () => {
      const onEmpty = jest.fn();
      const instance = create({}, { onEmpty });
      const sink = new FakeSink();
      instance.attach(sink);
      sink.buffered = 2 * 1024 * 1024;

      instance.write('a');

      expect(sink.overflowed).toBe(true);
      expect(instance.sinks.size).toBe(0);
      expect(onEmpty).toHaveBeenCalledWith(instance);
    });

    test('drops the chunks of a slow subscriber, telling it of the gap', () => {
      const instance = create({ onSlow: 'drop' });
      const sink = new FakeSink();
      instance.attach(sink);

      sink.buffered = 2 * 1024 * 1024;
      instance.write('a');
      instance.write('b');
      sink.buffered = 0;
      instance.write('c');

      expect(sink.gaps).toEqual([[1, 0, 2]]);
      expect(sink.chunks).toEqual(['c']);
    });

    test('skips the chunks of a slow subscriber to the next sync chunk', () => {
      const instance = create({ onSlow: 'skip-to-sync' });
      const sink = new FakeSink();
      instance.attach(sink);

      sink.buffered = 2 * 1024 * 1024;
      instance.write('a');
      sink.buffered = 0;
      instance.write('b');
      instance.write('c', { sync: true });
      instance.write('d');

      expect(sink.gaps).toEqual([[1, 0, 2]]);
      expect(sink.chunks).toEqual(['c', 'd']);
    });

    test('waits for ready while a subscriber is above the high-water mark', async () => {
      configOverrides.REALTIME_STREAM_HIGH_WATER_MARK = '10B';
      const instance = create();
      const sink = new FakeSink();
      instance.attach(sink);

      await expect(instance.ready).resolves.toBeUndefined();

      sink.buffered = 100;
      instance.write('a');
      let ready = false;
      const waiting = instance.ready.then(() => (ready = true));
      expect(instance.ready).toBe(instance.ready);
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(ready).toBe(false);

      sink.buffered = 0;
      await waiting;
      expect(ready).toBe(true);
    });

    test('ends with a result, then refuses the chunks', () => {
      const onEnd = jest.fn();
      const instance = create({ coalesce: 1000 }, { onEnd });
      const sink = new FakeSink();
      instance.attach(sink);

      instance.write('a');
      instance.end({ tokens: 1 });
      instance.end();

      expect(sink.messages).toEqual([
        { type: 'chunk', sid: 1, seq: 0, data: 'a' },
        { type: 'stream.end', sid: 1, seq: 1, result: { tokens: 1 } }
      ]);
      expect(sink.finished).toEqual([1]);
      expect(instance.ended).toBe(true);
      expect(instance.signal.aborted).toBe(true);
      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(instance.endEntry?.seq).toBe(1);
      expect(() => instance.write('b')).toThrow(
        expect.objectContaining({ code: ErrorCode.RealtimeStreamEnded })
      );
    });

    test('replays an ended stream with its end', () => {
      const instance = create();
      instance.write('a');
      instance.end();
      const sink = new FakeSink();

      instance.attach(sink);

      expect(sink.messages.map((message) => message.type)).toEqual([
        'chunk',
        'stream.end'
      ]);
      expect(sink.finished).toEqual([1]);
      expect(instance.sinks.size).toBe(0);
    });

    test('ends with the problem details of an error', () => {
      const instance = create();
      const sink = new FakeSink();
      instance.attach(sink);

      instance.error(
        new RealtimeError(ErrorCode.RealtimeStreamLost, 'Lost', {
          stream: 'answer'
        })
      );
      instance.error(new Error('ignored'));

      expect(sink.messages).toEqual([
        {
          type: 'stream.error',
          sid: 1,
          seq: 0,
          error: expect.objectContaining({
            code: ErrorCode.RealtimeStreamLost
          })
        }
      ]);
    });

    test('ends as cancelled, dropping the pending chunk', () => {
      jest.useFakeTimers();
      const instance = create({ coalesce: 1000 });
      const sink = new FakeSink();
      instance.attach(sink);

      instance.write('a');
      instance.cancel();
      instance.cancel();
      jest.advanceTimersByTime(1000);

      expect(sink.messages).toEqual([
        { type: 'stream.end', sid: 1, seq: 0, cancelled: true }
      ]);
    });

    test('feeds a mirror, ignoring the chunks sent before and telling the gaps', () => {
      const instance = create({}, {}, 5);
      const sink = new FakeSink();
      instance.attach(sink);

      instance.ingest(5, 'a');
      instance.ingest(5, 'a');
      instance.ingest(4, 'old');
      instance.ingest(8, 'b', true);
      instance.finishMirror({ type: 'stream.end', seq: 9, result: 1 });
      instance.finishMirror({ type: 'stream.end', seq: 10 });
      instance.ingest(10, 'c');

      expect(sink.starts[0].seq).toBe(5);
      expect(sink.gaps).toEqual([[1, 6, 8]]);
      expect(sink.messages).toEqual([
        { type: 'chunk', sid: 1, seq: 5, data: 'a' },
        { type: 'chunk', sid: 1, seq: 8, data: 'b', sync: true },
        { type: 'stream.end', sid: 1, seq: 9, result: 1 }
      ]);
    });

    test('detaches a subscriber, telling the hub once the last one left', () => {
      const onEmpty = jest.fn();
      const instance = create({}, { onEmpty });
      const first = new FakeSink();
      const second = new FakeSink();
      instance.attach(first);
      instance.attach(second);

      expect(instance.detach(first)).toBe(true);
      expect(instance.detach(first)).toBe(false);
      expect(onEmpty).not.toHaveBeenCalled();
      instance.detach(second);

      expect(onEmpty).toHaveBeenCalledWith(instance);
    });
  });
});
