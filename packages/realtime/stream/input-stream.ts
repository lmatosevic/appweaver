import { TSchema } from '@sinclair/typebox';
import {
  appConfig,
  ErrorCode,
  RealtimeError,
  textToBytes
} from '@appweaver/common';
import { realtimeConfig } from '../config';
import { validatePayload } from '../utils/validate';
import { StreamCodec, StreamInputOptions } from './types';

/** The settings of an input stream, with their defaults. */
export type InputSettings = {
  codec: StreamCodec;
  mimeType?: string;
  chunk?: TSchema;
  /** The bytes the client may send in all */
  maxBytes: number;
  /** The bytes the client may send ahead of the handler reading them */
  window: number;
};

/**
 * Resolves the settings of an input stream with their defaults.
 *
 * @param {StreamInputOptions} [options] - The options of the input.
 * @return {InputSettings} The settings.
 */
export function inputSettings(options: StreamInputOptions = {}): InputSettings {
  return {
    codec: options.codec ?? 'text',
    ...(options.mimeType ? { mimeType: options.mimeType } : {}),
    ...(options.chunk ? { chunk: options.chunk } : {}),
    maxBytes: textToBytes(
      options.maxBytes ?? realtimeConfig.STREAM_INPUT_MAX_BYTES
    ),
    window: textToBytes(realtimeConfig.STREAM_INPUT_WINDOW)
  };
}

/**
 * The chunks a client streams to an action, read by its handler as an async iterable. The client sends no more than
 * the window ahead of the handler: every chunk read gives the bytes back to the client (`onConsumed`), so a slow
 * handler slows the client down instead of filling the memory of the server.
 */
export class InputStream implements AsyncIterable<unknown> {
  /** @internal */
  private readonly _chunks: { data: unknown; size: number }[] = [];
  /** @internal */
  private readonly _waiters: {
    resolve: (result: IteratorResult<unknown>) => void;
    reject: (e: unknown) => void;
  }[] = [];
  /** @internal */
  private _received: number = 0;
  /** @internal */
  private _buffered: number = 0;
  /** @internal */
  private _ended: boolean = false;
  /** @internal */
  private _error?: Error;

  /**
   * @param {InputSettings} settings - The settings of the input.
   * @param {Function} [_onConsumed] - Receives the bytes of every chunk the handler reads.
   */
  constructor(
    public readonly settings: InputSettings,
    private readonly _onConsumed?: (size: number) => void
  ) {}

  /** The bytes received. */
  public get bytes(): number {
    return this._received;
  }

  /** Whether the client ended the input, or it failed. */
  public get ended(): boolean {
    return this._ended;
  }

  /**
   * Receives a chunk of the client.
   *
   * @param {unknown} data - A string of a `text` input, a value of a `json` one, the bytes or their base64 of a
   * `binary` one.
   * @param {number} size - The size of the message of the chunk, counted against the window and the limit.
   * @throws {RealtimeError} `REALTIME_MESSAGE_INVALID` for a chunk after the end or beyond the window,
   * `REALTIME_INPUT_LIMIT` beyond `maxBytes`, `REALTIME_PAYLOAD_INVALID` for a chunk of another type.
   */
  public push(data: unknown, size: number): void {
    if (this._ended) {
      throw new RealtimeError(
        ErrorCode.RealtimeMessageInvalid,
        'Realtime input already ended'
      );
    }
    if (this._buffered + size > this.settings.window) {
      throw new RealtimeError(
        ErrorCode.RealtimeMessageInvalid,
        'Realtime input sent beyond its window'
      );
    }
    if (this._received + size > this.settings.maxBytes) {
      throw new RealtimeError(
        ErrorCode.RealtimeInputLimit,
        'Realtime input too large',
        { limit: this.settings.maxBytes }
      );
    }

    const chunk = this.decode(data);
    this._received += size;

    const waiter = this._waiters.shift();
    if (waiter) {
      this._onConsumed?.(size);
      waiter.resolve({ done: false, value: chunk });
    } else {
      this._buffered += size;
      this._chunks.push({ data: chunk, size });
    }
  }

  /** Ends the input: the iteration ends once its chunks are read. */
  public end(): void {
    if (this._ended) {
      return;
    }
    this._ended = true;
    if (this._chunks.length === 0) {
      this._waiters
        .splice(0)
        .forEach((waiter) => waiter.resolve({ done: true, value: undefined }));
    }
  }

  /**
   * Fails the input, i.e. its call cancelled or its connection lost: the iteration throws the error, the chunks not
   * read are dropped.
   *
   * @param {unknown} error - The error.
   */
  public fail(error: unknown): void {
    if (this._ended && this._chunks.length === 0) {
      return;
    }
    this._ended = true;
    this._error = error instanceof Error ? error : new Error(String(error));
    this._chunks.length = 0;
    this._buffered = 0;
    this._waiters.splice(0).forEach((waiter) => waiter.reject(this._error));
  }

  public [Symbol.asyncIterator](): AsyncIterator<unknown> {
    return {
      next: () => {
        const chunk = this._chunks.shift();
        if (chunk) {
          this._buffered -= chunk.size;
          this._onConsumed?.(chunk.size);
          return Promise.resolve({ done: false, value: chunk.data });
        }
        if (this._error) {
          return Promise.reject(this._error);
        }
        if (this._ended) {
          return Promise.resolve({ done: true, value: undefined });
        }
        return new Promise((resolve, reject) =>
          this._waiters.push({ resolve, reject })
        );
      }
    };
  }

  /** @internal */
  private decode(data: unknown): unknown {
    const codec = this.settings.codec;
    if (codec === 'text' && typeof data === 'string') {
      return data;
    }
    if (codec === 'binary' && data instanceof Uint8Array) {
      return data;
    }
    if (codec === 'binary' && typeof data === 'string') {
      return new Uint8Array(Buffer.from(data, 'base64'));
    }
    if (codec === 'json' && data !== undefined) {
      if (this.settings.chunk && appConfig.ENV !== 'prod') {
        validatePayload(this.settings.chunk, data);
      }
      return data;
    }
    throw new RealtimeError(
      ErrorCode.RealtimePayloadInvalid,
      'Invalid realtime input chunk',
      {
        errors: [
          { path: '/', message: `Expected a chunk of the ${codec} codec` }
        ]
      }
    );
  }
}
