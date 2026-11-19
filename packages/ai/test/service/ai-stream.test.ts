import { AiResult, AiStream } from '../../index';

describe('ai-stream', () => {
  describe('AiStream', () => {
    test('is read once', async () => {
      const stream = new AiStream(async function* () {
        yield { type: 'text-delta', text: 'a' };
        return { text: 'a' } as AiResult;
      });

      await expect(stream.text()).resolves.toBe('a');
      await expect(stream.parts().next()).rejects.toThrow('already read');
    });

    test('ends the source when the reader stops early', async () => {
      const finished = jest.fn();
      const stream = new AiStream(async function* () {
        try {
          yield { type: 'text-delta', text: 'a' };
          yield { type: 'text-delta', text: 'b' };
          return {} as AiResult;
        } finally {
          finished();
        }
      });

      for await (const _ of stream) {
        break;
      }

      expect(finished).toHaveBeenCalled();
      await expect(stream.result).rejects.toThrow('not read to its end');
    });

    test('starts aborted with an aborted signal', async () => {
      const stream = new AiStream(
        async function* (signal) {
          signal.throwIfAborted();
          yield { type: 'text-delta', text: 'never' };
          return {} as AiResult;
        },
        AbortSignal.abort(new Error('Too late'))
      );

      await expect(stream.result).rejects.toThrow('Too late');
    });
  });
});
