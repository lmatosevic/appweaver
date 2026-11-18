import { Type } from '@sinclair/typebox';
import { configOverrides, ErrorCode } from '@appweaver/common';
import { InputStream, inputSettings } from '../../stream/input-stream';

const read = async (input: InputStream) => {
  const chunks: unknown[] = [];
  for await (const chunk of input) {
    chunks.push(chunk);
  }
  return chunks;
};

describe('input-stream', () => {
  afterEach(() => {
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  describe('inputSettings', () => {
    test('defaults to a text input with the limits of the config', () => {
      expect(inputSettings()).toEqual({
        codec: 'text',
        maxBytes: 10 * 1024 * 1024,
        window: 256 * 1024
      });
    });

    test('reads the options of the input', () => {
      const chunk = Type.Object({});
      configOverrides.REALTIME_STREAM_INPUT_WINDOW = '1KB';

      expect(
        inputSettings({
          codec: 'json',
          mimeType: 'application/json',
          chunk,
          maxBytes: '2KB'
        })
      ).toEqual({
        codec: 'json',
        mimeType: 'application/json',
        chunk,
        maxBytes: 2048,
        window: 1024
      });
    });
  });

  describe('InputStream', () => {
    test('reads the chunks, giving their bytes back as they are read', async () => {
      const consumed: number[] = [];
      const input = new InputStream(inputSettings(), (size) =>
        consumed.push(size)
      );

      input.push('a', 10);
      input.push('b', 20);
      const reading = read(input);
      await Promise.resolve();
      input.push('c', 5);
      input.end();
      input.end();

      expect(await reading).toEqual(['a', 'b', 'c']);
      expect(consumed).toEqual([10, 20, 5]);
      expect(input.bytes).toBe(35);
      expect(input.ended).toBe(true);
    });

    test('decodes the bytes of a binary input, sent raw or as base64', async () => {
      const input = new InputStream(inputSettings({ codec: 'binary' }));

      input.push(new Uint8Array([1]), 1);
      input.push('AgM=', 4);
      input.end();

      expect(await read(input)).toEqual([
        new Uint8Array([1]),
        new Uint8Array([2, 3])
      ]);
    });

    test('checks the chunks of a json input in every environment', () => {
      const input = new InputStream(
        inputSettings({
          codec: 'json',
          chunk: Type.Object({ x: Type.Number() })
        })
      );

      input.push({ x: 1 }, 5);
      expect(() => input.push({ x: 'a' }, 5)).toThrow(
        expect.objectContaining({ code: ErrorCode.RealtimePayloadInvalid })
      );
      configOverrides.APP_ENV = 'prod';
      expect(() => input.push({ x: 'a' }, 5)).toThrow(
        expect.objectContaining({ code: ErrorCode.RealtimePayloadInvalid })
      );
    });

    test.each([
      ['a chunk of another codec', 'text', 1],
      ['an undefined json chunk', 'json', undefined]
    ] as const)('refuses %s', (_, codec, data) => {
      const input = new InputStream(inputSettings({ codec }));

      expect(() => input.push(data, 1)).toThrow(
        expect.objectContaining({ code: ErrorCode.RealtimePayloadInvalid })
      );
    });

    test('refuses the chunks beyond the window not read yet', () => {
      configOverrides.REALTIME_STREAM_INPUT_WINDOW = '10B';
      const input = new InputStream(inputSettings());

      input.push('a', 6);

      expect(() => input.push('b', 6)).toThrow(
        expect.objectContaining({ code: ErrorCode.RealtimeMessageInvalid })
      );
    });

    test('refuses the chunks beyond its limit', async () => {
      const input = new InputStream(inputSettings({ maxBytes: '10B' }));

      input.push('a', 6);
      await input[Symbol.asyncIterator]().next();

      expect(() => input.push('b', 6)).toThrow(
        expect.objectContaining({
          code: ErrorCode.RealtimeInputLimit,
          details: { limit: 10 }
        })
      );
    });

    test('refuses a chunk after the end', () => {
      const input = new InputStream(inputSettings());
      input.end();

      expect(() => input.push('a', 1)).toThrow(
        expect.objectContaining({ code: ErrorCode.RealtimeMessageInvalid })
      );
    });

    test('throws the error of a failed input, dropping its chunks', async () => {
      const input = new InputStream(inputSettings());
      input.push('a', 1);
      const iterator = input[Symbol.asyncIterator]();
      await iterator.next();
      const waiting = iterator.next();

      input.fail(new Error('lost'));
      input.fail(new Error('ignored'));

      await expect(waiting).rejects.toThrow('lost');
      await expect(iterator.next()).rejects.toThrow('lost');
    });

    test('ignores a failure once its chunks are read', async () => {
      const input = new InputStream(inputSettings());
      input.end();
      input.fail(new Error('ignored'));

      expect(await read(input)).toEqual([]);
    });
  });
});
