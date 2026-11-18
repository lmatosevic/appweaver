import { Static, TSchema } from '@sinclair/typebox';
import { AuthUser, RealtimeAccess } from '@appweaver/common';

/** How the chunks of a stream are written: strings, JSON values, or bytes sent as base64 strings. */
export type StreamCodec = 'text' | 'json' | 'binary';

/** What a subscriber gets of a stream when it attaches: every chunk kept, the chunks from the last sync chunk, or
 * only the next ones. */
export type StreamReplay = 'all' | 'sync' | 'none';

/** What a subscriber reading too slowly gets: closed, its chunks dropped, or its chunks dropped until the next sync
 * chunk. */
export type StreamSlowPolicy = 'close' | 'drop' | 'skip-to-sync';

/** The chunk a stream of a codec writes. */
export type StreamChunk<
  C extends StreamCodec = StreamCodec,
  J extends TSchema = TSchema
> = C extends 'text' ? string : C extends 'binary' ? Uint8Array : Static<J>;

/** The settings of a stream, of a {@link createStream} or a streaming action. */
export type StreamOptions<
  C extends StreamCodec = StreamCodec,
  J extends TSchema = TSchema
> = {
  /** The codec of the chunks. Default: `text` */
  codec?: C;
  /** The media type of the bytes of a `binary` stream, i.e. `audio/mpeg`, told to the clients */
  mimeType?: string;
  /** The schema of the chunks of a `json` stream, checked outside of `prod` */
  chunk?: J;
  /** What a subscriber gets when it attaches, and the bytes kept for it. Default: `{ from: 'all' }` with
   * `realtime.streamReplayLimit` */
  replay?: { from?: StreamReplay; maxBytes?: string };
  /** What a subscriber reading too slowly gets. Default: `close` */
  onSlow?: StreamSlowPolicy;
  /** Milliseconds the `text` or `binary` chunks are merged for into one chunk, `0` for none. Default: `0` */
  coalesce?: number;
};

/** The config of a stream of {@link createStream}. */
export type StreamConfig<
  C extends StreamCodec = StreamCodec,
  J extends TSchema = TSchema,
  Q extends TSchema = TSchema
> = RealtimeAccess &
  StreamOptions<C, J> & {
    /** The name of the stream, i.e. `radio.live` */
    name: string;
    /** The description of the stream in the OpenAPI document */
    description?: string;
    /** The schema of the parameters of a subscription, validated when subscribing */
    params?: Q;
    /** Returns false to deny a subscription, called once when the client subscribes to a key */
    subscribe?(
      user: AuthUser | null,
      params: Static<Q>,
      key: string
    ): boolean | Promise<boolean>;
  };

/** The options of a chunk written to a stream. */
export type StreamWriteOptions = {
  /** Whether a subscriber can start from the chunk, i.e. a key frame, starting a chunk of its own */
  sync?: boolean;
};

/** An open stream, writing its chunks to every subscriber of its key on every instance. */
export type StreamWriter<
  C extends StreamCodec = StreamCodec,
  J extends TSchema = TSchema
> = {
  /** The name of the stream */
  readonly name: string;
  /** The key the stream is open for */
  readonly key: string;
  /** The ID of the stream, unique on every instance */
  readonly streamId: string;
  /** The subscribers on this instance, and the other instances relaying the stream */
  readonly subscribers: number;
  /** Whether the stream ended */
  readonly ended: boolean;
  /** Aborted once the stream ends, is cancelled or the instance shuts down: stop producing */
  readonly signal: AbortSignal;
  /** Resolves once every subscriber is below `realtime.streamHighWaterMark`, or the stream ended */
  readonly ready: Promise<void>;
  /**
   * Writes a chunk to the subscribers.
   *
   * @param {Object} chunk - A string of a `text` stream, a value of a `json` one, bytes of a `binary` one.
   * @param {StreamWriteOptions} [options] - Whether a subscriber can start from the chunk.
   * @throws {RealtimeError} `REALTIME_STREAM_ENDED` once ended, `REALTIME_PAYLOAD_INVALID` for a chunk of another
   * type.
   */
  write(chunk: StreamChunk<C, J>, options?: StreamWriteOptions): void;
  /**
   * Ends the stream.
   *
   * @param {unknown} [result] - The result sent with the end, a JSON value.
   */
  end(result?: unknown): void;
  /**
   * Ends the stream with an error, sent to the subscribers as its problem details.
   *
   * @param {unknown} error - The error.
   */
  error(error: unknown): void;
};

/** A stream of the application or of a module, opened for a key its subscribers subscribe to. */
export type Stream<
  C extends StreamCodec = StreamCodec,
  J extends TSchema = TSchema,
  Q extends TSchema = TSchema
> = {
  /** The name of the stream */
  readonly name: string;
  /** The config of the stream */
  readonly config: StreamConfig<C, J, Q>;
  /**
   * Opens the stream for a key, i.e. a radio station or a chat room. The subscribers of the key on every instance
   * receive it, several streams of a key at once each with an ID of its own.
   *
   * @param {string} [key] - The key. Default: `''`
   * @return {StreamWriter} The writer of the stream.
   */
  open(key?: string): StreamWriter<C, J>;
};

/** What a subscriber is told when a stream starts for it. */
export type StreamStart = {
  /** The ID of the stream on this instance, naming it in the frames */
  sid: number;
  /** The ID of the stream, unique on every instance */
  streamId: string;
  /** The name of the stream, or of the streaming action */
  name: string;
  /** The key of the stream */
  key: string;
  /** The codec of the chunks */
  codec: StreamCodec;
  /** The media type of a `binary` stream */
  mimeType?: string;
  /** The sequence number of the first chunk the subscriber receives */
  seq: number;
};

/** A message of a stream, encoded once for every subscriber. */
export type StreamFrameMessage =
  | { type: 'chunk'; sid: number; seq: number; data: unknown; sync?: true }
  | {
      type: 'stream.end';
      sid: number;
      seq: number;
      result?: unknown;
      cancelled?: true;
    }
  | { type: 'stream.error'; sid: number; seq: number; error: unknown };

/** A subscriber of a stream: a realtime connection, or the response of a streaming action called over HTTP. */
export interface StreamSink {
  /** Tells the subscriber a stream starts for it, before its chunks. */
  start(start: StreamStart): void;
  /** Sends a frame, encoded once for every subscriber. */
  write(frame: StreamFrameLike): void;
  /** Tells the subscriber it missed the chunks from `from` to `to`, excluded. */
  gap(sid: number, from: number, to: number): void;
  /** The bytes waiting to be sent to the subscriber. */
  bufferedAmount(): number;
  /** Closes the subscriber reading too slowly, of the `close` policy. */
  overflow(): void;
  /** Called once the stream ended for the subscriber, after its last frame. */
  finish(sid: number): void;
}

/** A frame of a stream: its message, and its JSON encoded once. */
export interface StreamFrameLike {
  /** The message */
  readonly message: StreamFrameMessage;
  /** The JSON of the message */
  readonly json: string;
  /** The event of a Server-Sent Events stream */
  readonly sse: string;
}
