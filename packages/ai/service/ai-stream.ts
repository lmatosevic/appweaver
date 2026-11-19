import { AiStreamPart } from '../types';
import { AiResult } from './prompt';

/** Produces the parts of a stream, returning the result once it ends. */
export type AiStreamSource<R> = (
  signal: AbortSignal
) => AsyncGenerator<AiStreamPart, R>;

/**
 * A streamed response of a model: an async iterable of the text deltas, i.e. returned by the handler of a streaming
 * realtime action or piped into an HTTP response, with the result once it ends. The stream is read once, by iterating
 * it, {@link parts} or {@link text}; awaiting only the {@link result} reads it in the background.
 *
 * @example
 * const stream = ai.stream({ model: 'fast', prompt: 'Tell a story' });
 * for await (const text of stream) {
 *   process.stdout.write(text);
 * }
 * const { usage } = await stream.result;
 */
export class AiStream<R = AiResult> implements AsyncIterable<string> {
  /** @internal */
  private readonly _controller = new AbortController();
  /** @internal */
  private readonly _result: Promise<R>;
  /** @internal */
  private _resolve!: (result: R) => void;
  /** @internal */
  private _reject!: (error: unknown) => void;
  /** @internal */
  private _started = false;

  /**
   * @param {AiStreamSource} source - Produces the parts, aborted with the stream.
   * @param {AbortSignal} [signal] - Aborts the stream.
   */
  constructor(
    private readonly source: AiStreamSource<R>,
    signal?: AbortSignal
  ) {
    this._result = new Promise<R>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    // The error is also thrown to the reader, the result may never be awaited
    this._result.catch(() => {});
    if (signal) {
      if (signal.aborted) {
        this._controller.abort(signal.reason);
      } else {
        signal.addEventListener(
          'abort',
          () => this._controller.abort(signal.reason),
          { once: true }
        );
      }
    }
  }

  /** The result once the stream ends, read in the background when the stream is not read otherwise. */
  public get result(): Promise<R> {
    if (!this._started) {
      void this.drain();
    }
    return this._result;
  }

  /** Aborted once the stream is aborted. */
  public get signal(): AbortSignal {
    return this._controller.signal;
  }

  /**
   * Reads the parts of the stream: the text and reasoning deltas, the tool calls and their results, and the finish.
   *
   * @return {AsyncIterable<AiStreamPart>} The parts.
   * @throws {Error} When the stream is already read.
   */
  public async *parts(): AsyncGenerator<AiStreamPart, void> {
    if (this._started) {
      throw new Error('The AI stream is already read');
    }
    this._started = true;
    const parts = this.source(this._controller.signal);
    try {
      while (true) {
        const next = await parts.next();
        if (next.done) {
          this._resolve(next.value);
          return;
        }
        yield next.value;
      }
    } catch (error) {
      this._reject(error);
      throw error;
    } finally {
      if (!this._controller.signal.aborted) {
        // A reader stopping early ends the stream
        await parts.return?.(undefined as R);
      }
      this._reject(new Error('The AI stream was not read to its end'));
    }
  }

  /**
   * Reads the stream to its end.
   *
   * @return {Promise<string>} The whole text.
   */
  public async text(): Promise<string> {
    let text = '';
    for await (const delta of this) {
      text += delta;
    }
    return text;
  }

  /**
   * Aborts the stream, its model call and its tool calls.
   *
   * @param {unknown} [reason] - The reason of the abort, thrown to the reader.
   */
  public abort(reason?: unknown): void {
    this._controller.abort(reason);
  }

  public async *[Symbol.asyncIterator](): AsyncIterator<string> {
    for await (const part of this.parts()) {
      if (part.type === 'text-delta') {
        yield part.text;
      }
    }
  }

  /** @internal */
  private async drain(): Promise<void> {
    try {
      for await (const _ of this.parts()) {
        // Read for the result
      }
    } catch {
      // Rejected through the result
    }
  }
}
