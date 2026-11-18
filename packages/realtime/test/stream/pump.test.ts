import { pumpStream } from '../../stream/pump';
import { StreamInstance, streamSettings } from '../../stream/stream-instance';
import { FakeSink } from '../fixtures/fake-sink';

const create = () =>
  new StreamInstance(1, 'id', 'assistant', 'id', streamSettings());

describe('pump', () => {
  describe('pumpStream', () => {
    test('writes the chunks, ending with the value returned', async () => {
      const instance = create();
      const sink = new FakeSink();
      instance.attach(sink);

      await pumpStream(
        instance,
        (async function* () {
          yield 'a';
          yield 'b';
          return 'done';
        })()
      );

      expect(sink.chunks).toEqual(['a', 'b']);
      expect(sink.messages.at(-1)).toMatchObject({
        type: 'stream.end',
        result: 'done'
      });
    });

    test('stops the iterable of a cancelled stream', async () => {
      const instance = create();
      const returned = jest.fn();
      let next = 0;
      const iterable: AsyncIterable<string> = {
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            if (++next === 2) {
              instance.cancel();
            }
            return { done: false, value: 'a' };
          },
          return: async () => {
            returned();
            return { done: true, value: undefined };
          }
        })
      };

      await pumpStream(instance, iterable);

      expect(returned).toHaveBeenCalledTimes(1);
      expect(instance.ring.map((entry) => entry.data)).toEqual(['a']);
    });

    test('pulls nothing of a stream already ended', async () => {
      const instance = create();
      instance.end();
      const next = jest.fn();

      await pumpStream(instance, {
        [Symbol.asyncIterator]: () => ({ next })
      });

      expect(next).not.toHaveBeenCalled();
    });

    test('ends the stream with the error of the iterable', async () => {
      const instance = create();

      await pumpStream(
        instance,
        // eslint-disable-next-line require-yield
        (async function* () {
          throw new Error('failed');
        })()
      );

      expect(instance.endEntry?.frame.message.type).toBe('stream.error');
    });
  });
});
