import { TSchema } from '@sinclair/typebox';
import {
  appConfig,
  ErrorCode,
  RealtimeError,
  textToBytes
} from '@appweaver/common';
import { realtimeConfig } from '../config';
import { realtimeMetrics } from '../utils/telemetry';
import { validatePayload } from '../utils/validate';
import { StreamFrame } from './stream-frame';
import { streamProblem } from './stream-problem';
import {
  StreamCodec,
  StreamOptions,
  StreamReplay,
  StreamSink,
  StreamSlowPolicy,
  StreamStart,
  StreamWriteOptions
} from './types';

/** The bytes a coalesced chunk holds at most, flushed once reached. */
const MAX_COALESCED_BYTES = 64 * 1024;

/** Milliseconds between the checks of `ready` while a subscriber is above the high-water mark. */
const READY_POLL_INTERVAL = 10;

/** The settings of a stream, with their defaults. */
export type StreamSettings = {
  codec: StreamCodec;
  mimeType?: string;
  chunk?: TSchema;
  replayFrom: StreamReplay;
  replayBytes?: number;
  onSlow: StreamSlowPolicy;
  coalesce: number;
};

/** A chunk kept for the subscribers joining late or resuming. */
export type RingEntry = {
  seq: number;
  data: unknown;
  sync?: true;
  frame: StreamFrame;
  bytes: number;
};

/** The callbacks of the hub on the events of a stream. */
export type StreamInstanceHooks = {
  /** A chunk was sent, relayed by the owner of a stream */
  onChunk?(instance: StreamInstance, entry: RingEntry): void;
  /** The stream ended, with its last frame */
  onEnd?(instance: StreamInstance, entry: RingEntry): void;
  /** The last subscriber detached */
  onEmpty?(instance: StreamInstance): void;
};

const sizes = new Map<string, number>();

/** The bytes of a size of the config, parsed once. */
function configBytes(text: string): number {
  let bytes = sizes.get(text);
  if (bytes === undefined) {
    bytes = textToBytes(text);
    sizes.set(text, bytes);
  }
  return bytes;
}

type SinkState = {
  /** The first sequence number the subscriber missed */
  gapFrom?: number;
  /** Whether the chunks are dropped until the next sync chunk */
  skipping?: boolean;
};

/**
 * Resolves the settings of a stream with their defaults.
 *
 * @param {StreamOptions} options - The options of the stream.
 * @return {StreamSettings} The settings.
 */
export function streamSettings(options: StreamOptions = {}): StreamSettings {
  return {
    codec: options.codec ?? 'text',
    ...(options.mimeType ? { mimeType: options.mimeType } : {}),
    ...(options.chunk ? { chunk: options.chunk } : {}),
    replayFrom: options.replay?.from ?? 'all',
    ...(options.replay?.maxBytes
      ? { replayBytes: textToBytes(options.replay.maxBytes) }
      : {}),
    onSlow: options.onSlow ?? 'close',
    coalesce: options.codec === 'json' ? 0 : (options.coalesce ?? 0)
  };
}

/**
 * A stream on this instance: one its producer writes to (the owner), or the mirror of one of another instance fed by
 * the relay. It numbers the chunks, encodes each one once, keeps the last ones for the late and resuming subscribers,
 * and sends them to its subscribers, checking none of them per chunk but how much they have waiting.
 */
export class StreamInstance {
  /** The subscribers, with their delivery state */
  public readonly sinks = new Map<StreamSink, SinkState>();
  /** The chunks kept for the late and resuming subscribers */
  public readonly ring: RingEntry[] = [];
  /** The epoch milliseconds of the last message of the owner of a mirror */
  public lastSeen: number = Date.now();

  /** @internal */
  private _nextSeq: number;
  /** @internal */
  private _ringBytes: number = 0;
  /** @internal */
  private _end?: RingEntry;
  /** @internal */
  private readonly _controller = new AbortController();
  /** @internal */
  private _pending?: {
    parts: (string | Uint8Array)[];
    bytes: number;
    sync?: true;
    timer?: NodeJS.Timeout;
  };
  /** @internal */
  private _congested: boolean = false;
  /** @internal */
  private _ready?: Promise<void>;

  /**
   * @param {number} sid - The ID of the stream on this instance.
   * @param {string} streamId - The ID of the stream on every instance.
   * @param {string} name - The name of the stream, or of the streaming action.
   * @param {string} key - The key of the stream.
   * @param {StreamSettings} settings - The settings.
   * @param {StreamInstanceHooks} [_hooks] - The callbacks of the hub.
   * @param {number} [seq] - The sequence number of the first chunk, of a mirror.
   */
  constructor(
    public readonly sid: number,
    public readonly streamId: string,
    public readonly name: string,
    public readonly key: string,
    public readonly settings: StreamSettings,
    private readonly _hooks: StreamInstanceHooks = {},
    seq: number = 0
  ) {
    this._nextSeq = seq;
  }

  /** The sequence number of the next chunk. */
  public get nextSeq(): number {
    return this._nextSeq;
  }

  /** Whether the stream ended. */
  public get ended(): boolean {
    return this._end !== undefined;
  }

  /** The last frame of an ended stream. */
  public get endEntry(): RingEntry | undefined {
    return this._end;
  }

  /** Aborted once the stream ends. */
  public get signal(): AbortSignal {
    return this._controller.signal;
  }

  /** Resolves once every subscriber is below the high-water mark, or the stream ended. */
  public get ready(): Promise<void> {
    if (!this._congested || this._end) {
      return Promise.resolve();
    }
    this._ready ??= new Promise<void>((resolve) => {
      const check = () => {
        if (this._end || !this.congested()) {
          this._congested = false;
          this._ready = undefined;
          resolve();
        } else {
          setTimeout(check, READY_POLL_INTERVAL).unref();
        }
      };
      setTimeout(check, READY_POLL_INTERVAL).unref();
    });
    return this._ready;
  }

  /**
   * Writes a chunk of the producer, merged with the next ones for the `coalesce` milliseconds of the stream.
   *
   * @param {unknown} chunk - The chunk.
   * @param {StreamWriteOptions} [options] - Whether a subscriber can start from the chunk.
   * @throws {RealtimeError} `REALTIME_STREAM_ENDED` once ended, `REALTIME_PAYLOAD_INVALID` for a chunk of another
   * type.
   */
  public write(chunk: unknown, options: StreamWriteOptions = {}): void {
    if (this._end) {
      throw new RealtimeError(
        ErrorCode.RealtimeStreamEnded,
        `Realtime stream '${this.name}' ended`,
        { stream: this.name }
      );
    }
    const part = this.checkChunk(chunk);

    if (this.settings.coalesce <= 0) {
      this.emit(this._nextSeq, this.encode([part]), options.sync);
      return;
    }

    if (options.sync && this._pending) {
      this.flush();
    }
    const pending = (this._pending ??= { parts: [], bytes: 0 });
    pending.parts.push(part as string | Uint8Array);
    pending.bytes +=
      typeof part === 'string' ? part.length : (part as Uint8Array).byteLength;
    if (options.sync) {
      pending.sync = true;
    }
    if (pending.bytes >= MAX_COALESCED_BYTES) {
      this.flush();
    } else if (!pending.timer) {
      pending.timer = setTimeout(() => this.flush(), this.settings.coalesce);
    }
  }

  /**
   * Feeds a mirror with a chunk of the owner, already encoded. A chunk sent before is ignored, and a chunk after a
   * missing one tells the subscribers of the gap.
   *
   * @param {number} seq - The sequence number of the chunk.
   * @param {unknown} data - The encoded data of the chunk.
   * @param {boolean} [sync] - Whether a subscriber can start from the chunk.
   */
  public ingest(seq: number, data: unknown, sync?: boolean): void {
    this.lastSeen = Date.now();
    if (this._end || seq < this._nextSeq) {
      return;
    }
    if (seq > this._nextSeq) {
      for (const state of this.sinks.values()) {
        state.gapFrom ??= this._nextSeq;
      }
    }
    this.emit(seq, data, sync);
  }

  /**
   * Attaches a subscriber: tells it the stream starts, sends it the chunks kept for it, then the next ones.
   *
   * @param {StreamSink} sink - The subscriber.
   * @param {number} [fromSeq] - The sequence number to resume from, the replay of the stream otherwise.
   */
  public attach(sink: StreamSink, fromSeq?: number): void {
    const first = this.ring[0]?.seq ?? this._nextSeq;
    let index: number;
    let gap: [number, number] | undefined;

    if (fromSeq !== undefined) {
      index = this.ring.findIndex((entry) => entry.seq >= fromSeq);
      if (index < 0) {
        index = this.ring.length;
      }
      if (fromSeq < first) {
        gap = [fromSeq, first];
      }
    } else {
      index = this.replayIndex();
    }

    sink.start(this.startOf(this.ring[index]?.seq ?? this._nextSeq));
    if (gap) {
      sink.gap(this.sid, gap[0], gap[1]);
    }
    for (const entry of this.ring.slice(index)) {
      sink.write(entry.frame);
    }

    if (this._end) {
      sink.write(this._end.frame);
      sink.finish(this.sid);
      return;
    }
    this.sinks.set(sink, {});
  }

  /**
   * Detaches a subscriber, without telling it anything.
   *
   * @param {StreamSink} sink - The subscriber.
   * @return {boolean} `true` if the subscriber was attached.
   */
  public detach(sink: StreamSink): boolean {
    if (!this.sinks.delete(sink)) {
      return false;
    }
    if (this.sinks.size === 0) {
      this._hooks.onEmpty?.(this);
    }
    return true;
  }

  /**
   * Ends the stream, sending the pending chunk, then the end with its result.
   *
   * @param {unknown} [result] - The result, a JSON value.
   */
  public end(result?: unknown): void {
    if (this._end) {
      return;
    }
    this.flush();
    this.terminate({
      type: 'stream.end',
      sid: this.sid,
      seq: this._nextSeq,
      ...(result !== undefined ? { result } : {})
    });
  }

  /**
   * Ends the stream with an error, sending its problem details.
   *
   * @param {unknown} error - The error.
   */
  public error(error: unknown): void {
    if (this._end) {
      return;
    }
    this.flush();
    this.terminate({
      type: 'stream.error',
      sid: this.sid,
      seq: this._nextSeq,
      error: streamProblem(error)
    });
  }

  /** Ends the stream as cancelled, dropping the pending chunk. */
  public cancel(): void {
    if (this._end) {
      return;
    }
    clearTimeout(this._pending?.timer);
    this._pending = undefined;
    this.terminate({
      type: 'stream.end',
      sid: this.sid,
      seq: this._nextSeq,
      cancelled: true
    });
  }

  /**
   * Ends a mirror with the last frame of its owner, with the sequence number of the owner.
   *
   * @param {Object} message - The end or the error of the owner.
   */
  public finishMirror(
    message:
      | { type: 'stream.end'; seq: number; result?: unknown; cancelled?: true }
      | { type: 'stream.error'; seq: number; error: unknown }
  ): void {
    if (!this._end) {
      this.terminate({ ...message, sid: this.sid });
    }
  }

  /** @internal */
  private terminate(
    message: ConstructorParameters<typeof StreamFrame>[0]
  ): void {
    const frame = new StreamFrame(message);
    const entry: RingEntry = {
      seq: message.seq,
      data: undefined,
      frame,
      bytes: 0
    };
    this._end = entry;
    this._nextSeq = message.seq + 1;

    const sinks = [...this.sinks.keys()];
    this.sinks.clear();
    for (const sink of sinks) {
      sink.write(frame);
      sink.finish(this.sid);
    }

    this._controller.abort();
    this._hooks.onEnd?.(this, entry);
  }

  /** @internal */
  private flush(): void {
    const pending = this._pending;
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this._pending = undefined;
    if (!this._end) {
      this.emit(this._nextSeq, this.encode(pending.parts), pending.sync);
    }
  }

  /** @internal */
  private emit(seq: number, data: unknown, sync?: boolean): void {
    const frame = new StreamFrame({
      type: 'chunk',
      sid: this.sid,
      seq,
      data,
      ...(sync ? { sync: true as const } : {})
    });
    const entry: RingEntry = {
      seq,
      data,
      ...(sync ? { sync: true as const } : {}),
      frame,
      bytes: frame.json.length
    };
    this._nextSeq = seq + 1;
    this.keep(entry);

    const limit = configBytes(realtimeConfig.SEND_BUFFER_LIMIT);
    const highWaterMark = configBytes(realtimeConfig.STREAM_HIGH_WATER_MARK);
    let congested = false;

    for (const [sink, state] of this.sinks) {
      if (this.deliver(sink, state, entry, limit)) {
        congested ||= sink.bufferedAmount() > highWaterMark;
      }
    }
    this._congested = congested;

    realtimeMetrics.streamChunk(this.name, entry.bytes);
    this._hooks.onChunk?.(this, entry);
  }

  /** @internal */
  private deliver(
    sink: StreamSink,
    state: SinkState,
    entry: RingEntry,
    limit: number
  ): boolean {
    if (state.skipping && !entry.sync) {
      return false;
    }

    if (sink.bufferedAmount() > limit) {
      realtimeMetrics.events(`stream:${this.name}`, 'dropped');
      switch (this.settings.onSlow) {
        case 'drop':
          state.gapFrom ??= entry.seq;
          return false;
        case 'skip-to-sync':
          state.gapFrom ??= entry.seq;
          state.skipping = true;
          return false;
        default:
          this.detach(sink);
          sink.overflow();
          return false;
      }
    }

    if (state.gapFrom !== undefined) {
      sink.gap(this.sid, state.gapFrom, entry.seq);
      state.gapFrom = undefined;
      state.skipping = false;
    }
    sink.write(entry.frame);
    return true;
  }

  /** @internal */
  private keep(entry: RingEntry): void {
    const limit =
      this.settings.replayBytes ??
      configBytes(realtimeConfig.STREAM_REPLAY_LIMIT);
    this.ring.push(entry);
    this._ringBytes += entry.bytes;
    while (this._ringBytes > limit && this.ring.length > 0) {
      this._ringBytes -= this.ring.shift()!.bytes;
    }
  }

  /** @internal */
  private replayIndex(): number {
    switch (this.settings.replayFrom) {
      case 'none':
        return this.ring.length;
      case 'sync': {
        for (let i = this.ring.length - 1; i >= 0; i--) {
          if (this.ring[i].sync) {
            return i;
          }
        }
        return this.ring.length;
      }
      default:
        return 0;
    }
  }

  /** @internal */
  private startOf(seq: number): StreamStart {
    return {
      sid: this.sid,
      streamId: this.streamId,
      name: this.name,
      key: this.key,
      codec: this.settings.codec,
      ...(this.settings.mimeType ? { mimeType: this.settings.mimeType } : {}),
      seq
    };
  }

  /** @internal */
  private congested(): boolean {
    const highWaterMark = configBytes(realtimeConfig.STREAM_HIGH_WATER_MARK);
    for (const sink of this.sinks.keys()) {
      if (sink.bufferedAmount() > highWaterMark) {
        return true;
      }
    }
    return false;
  }

  /** @internal */
  private checkChunk(chunk: unknown): unknown {
    const codec = this.settings.codec;
    if (codec === 'text' && typeof chunk === 'string') {
      return chunk;
    }
    if (codec === 'binary' && chunk instanceof Uint8Array) {
      return chunk;
    }
    if (codec === 'json' && chunk !== undefined) {
      if (this.settings.chunk && appConfig.ENV !== 'prod') {
        validatePayload(this.settings.chunk, chunk);
      }
      return chunk;
    }
    throw new RealtimeError(
      ErrorCode.RealtimePayloadInvalid,
      'Invalid realtime stream chunk',
      {
        errors: [
          { path: '/', message: `Expected a chunk of the ${codec} codec` }
        ]
      }
    );
  }

  /** @internal */
  private encode(parts: unknown[]): unknown {
    switch (this.settings.codec) {
      case 'binary':
        return Buffer.concat(parts as Uint8Array[]).toString('base64');
      case 'json':
        return parts[0];
      default:
        return parts.length === 1 ? parts[0] : parts.join('');
    }
  }
}
