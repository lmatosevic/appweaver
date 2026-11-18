import { Readable } from 'node:stream';
import { isAppweaverError } from '@appweaver/common';
import { AiStream } from '../service/ai-stream';
import { AiStreamPart } from '../types';

/**
 * The writer of a stream the text of a model is piped into, i.e. a `StreamWriter` of `createStream` of
 * `@appweaver/realtime`.
 */
export type AiStreamWriter = {
  /** Writes a text delta */
  write(chunk: string): void;
  /** Ends the stream with a result */
  end(result?: unknown): void;
  /** Ends the stream with an error */
  error(error: unknown): void;
  /** Aborted once the stream is cancelled: the model call is aborted */
  readonly signal?: AbortSignal;
  /** Resolves once the subscribers can take more chunks */
  readonly ready?: Promise<void>;
};

/**
 * Pipes the text of a model into a stream writer, i.e. the answer of an LLM shown to every subscriber of a realtime
 * stream, aborting the model call once the stream is cancelled. The stream ends with the finish reason and the tokens,
 * or with the error of the call.
 *
 * @example
 * const writer = roomAnswer.open(String(roomId));
 * await pipeAiStream(ai.stream({ model: 'fast', prompt: question }), writer);
 *
 * @param {AiStream} stream - The stream of the model.
 * @param {AiStreamWriter} writer - The writer.
 * @return {Promise<boolean>} `true` once the stream ended, `false` when it failed.
 */
export async function pipeAiStream(
  stream: AiStream,
  writer: AiStreamWriter
): Promise<boolean> {
  const abort = () => stream.abort(writer.signal?.reason);
  writer.signal?.addEventListener('abort', abort, { once: true });
  try {
    for await (const text of stream) {
      await writer.ready;
      writer.write(text);
    }
    const { finishReason, usage } = await stream.result;
    writer.end({ finishReason, usage });
    return true;
  } catch (error) {
    writer.error(error);
    return false;
  } finally {
    writer.signal?.removeEventListener('abort', abort);
  }
}

/**
 * Encodes the parts of a model stream as Server-Sent Events, each an event named by the type of its part with the part
 * as its JSON data, and an `error` event with the code and the message of a failure.
 *
 * @param {AiStream | AsyncIterable<AiStreamPart>} stream - The stream, or its parts.
 * @return {AsyncGenerator<string>} The events.
 */
export async function* toServerSentEvents(
  stream: AiStream | AsyncIterable<AiStreamPart>
): AsyncGenerator<string> {
  const parts = stream instanceof AiStream ? stream.parts() : stream;
  try {
    for await (const part of parts) {
      yield `event: ${part.type}\ndata: ${JSON.stringify(part)}\n\n`;
    }
  } catch (error) {
    yield `event: error\ndata: ${JSON.stringify(streamError(error))}\n\n`;
  }
}

/**
 * Creates the body of an HTTP response streaming a model as Server-Sent Events, sent by a route with the
 * `text/event-stream` content type. The model call is aborted when the client disconnects.
 *
 * @example
 * reply.header('content-type', 'text/event-stream');
 * return reply.send(aiEventStream(ai.stream({ prompt: request.body.question })));
 *
 * @param {AiStream} stream - The stream of the model.
 * @return {Readable} The body of the response.
 */
export function aiEventStream(stream: AiStream): Readable {
  let finished = false;
  const body = Readable.from(
    (async function* () {
      yield* toServerSentEvents(stream);
      finished = true;
    })()
  );
  body.once('close', () => {
    if (!finished) {
      stream.abort();
    }
  });
  return body;
}

/** The code and the message of the error of a stream, sent to its client. */
function streamError(error: unknown): { code: string; message: string } {
  return {
    code: isAppweaverError(error) ? error.code : 'INTERNAL_ERROR',
    message: (error as Error)?.message ?? String(error)
  };
}
