import { Readable } from 'node:stream';
import { AiError, ErrorCode } from '@appweaver/common';
import {
  aiEventStream,
  AiResult,
  AiStream,
  AiStreamPart,
  pipeAiStream,
  toServerSentEvents
} from '../../index';

/** A stream of the given parts, failing with the error after them. */
function streamOf(parts: AiStreamPart[], error?: Error): AiStream {
  return new AiStream(async function* () {
    yield* parts;
    if (error) {
      throw error;
    }
    return {
      text: 'Hi you',
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
    } as AiResult;
  });
}

const parts: AiStreamPart[] = [
  { type: 'text-delta', text: 'Hi ' },
  { type: 'text-delta', text: 'you' },
  { type: 'finish', finishReason: 'stop' }
];

async function collect(iterable: AsyncIterable<string>): Promise<string> {
  let text = '';
  for await (const chunk of iterable) {
    text += chunk;
  }
  return text;
}

describe('stream-util', () => {
  describe('pipeAiStream', () => {
    test('writes the text and ends with the finish reason and the tokens', async () => {
      const writer = {
        write: jest.fn(),
        end: jest.fn(),
        error: jest.fn(),
        ready: Promise.resolve()
      };

      await expect(pipeAiStream(streamOf(parts), writer)).resolves.toBe(true);

      expect(writer.write.mock.calls).toEqual([['Hi '], ['you']]);
      expect(writer.end).toHaveBeenCalledWith({
        finishReason: 'stop',
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 }
      });
    });

    test('ends the writer with the error of the stream', async () => {
      const writer = { write: jest.fn(), end: jest.fn(), error: jest.fn() };
      const error = new Error('Failed');

      await expect(pipeAiStream(streamOf(parts, error), writer)).resolves.toBe(
        false
      );

      expect(writer.error).toHaveBeenCalledWith(error);
    });

    test('aborts the stream once the writer is cancelled', async () => {
      const controller = new AbortController();
      const writer = {
        write: jest.fn(() => controller.abort(new Error('Cancelled'))),
        end: jest.fn(),
        error: jest.fn(),
        signal: controller.signal
      };
      const stream = new AiStream(async function* (signal) {
        yield { type: 'text-delta', text: 'a' };
        signal.throwIfAborted();
        return {} as AiResult;
      });

      await pipeAiStream(stream, writer);

      expect(writer.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Cancelled' })
      );
    });
  });

  describe('toServerSentEvents', () => {
    test('encodes every part as an event', async () => {
      const events = await collect(toServerSentEvents(streamOf(parts)));

      expect(events).toBe(
        'event: text-delta\ndata: {"type":"text-delta","text":"Hi "}\n\n' +
          'event: text-delta\ndata: {"type":"text-delta","text":"you"}\n\n' +
          'event: finish\ndata: {"type":"finish","finishReason":"stop"}\n\n'
      );
    });

    test('ends with an error event', async () => {
      const error = new AiError(ErrorCode.AiTimeout, 'Too slow', {
        model: 'm',
        endpoint: 'e'
      });

      const events = await collect(toServerSentEvents(streamOf([], error)));

      expect(events).toBe(
        'event: error\ndata: {"code":"AI_TIMEOUT","message":"Too slow"}\n\n'
      );
    });
  });

  describe('aiEventStream', () => {
    test('streams the events, aborting the model when the client leaves', async () => {
      const body = aiEventStream(streamOf(parts));
      expect(body).toBeInstanceOf(Readable);
      await expect(collect(body)).resolves.toContain('event: finish');

      const stream = new AiStream(async function* (signal) {
        yield { type: 'text-delta', text: 'a' };
        await new Promise((resolve) =>
          signal.addEventListener('abort', resolve)
        );
        return {} as AiResult;
      });
      const left = aiEventStream(stream);
      left.once('data', () => left.destroy());
      await new Promise((resolve) => left.once('close', resolve));

      expect(stream.signal.aborted).toBe(true);
    });
  });
});
