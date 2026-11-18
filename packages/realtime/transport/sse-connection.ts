import { ServerResponse } from 'node:http';
import { StreamFrameLike } from '../stream/types';
import { RealtimeCloseCode, RealtimeServerMessage } from '../types';
import { ConnectionAuth, RealtimeConnection } from '../gateway/connection';

/**
 * A connection of the Server-Sent Events transport, writing every message as the JSON data of an event, with the ID
 * of a channel event as the event ID.
 */
export class SseConnection extends RealtimeConnection {
  public readonly transport = 'sse' as const;

  /** @internal */
  private _started: boolean = false;

  /**
   * @param {ConnectionAuth} auth - The authentication of the connection.
   * @param {ServerResponse} _response - The response the events are written to.
   * @param {Function} _start - Writes the head of the response, called before the first message.
   */
  constructor(
    auth: ConnectionAuth,
    private readonly _response: ServerResponse,
    private readonly _start: () => void
  ) {
    super(auth);
  }

  public send(message: RealtimeServerMessage): void {
    const id = message.type === 'event' ? `id: ${message.eventId}\n` : '';
    this.write(`${id}data: ${JSON.stringify(message)}\n\n`);
  }

  public sendFrame(frame: StreamFrameLike): void {
    this.write(frame.sse);
  }

  public heartbeat(): void {
    this.write(': ping\n\n');
  }

  public bufferedAmount(): number {
    return this._response.writableLength;
  }

  public close(code: RealtimeCloseCode, reason: string): void {
    if (this.closed) {
      return;
    }
    if (this._started) {
      // An event stream has no close code, so it is written as a comment
      this.write(`: close ${code} ${reason}\n\n`);
    }
    this.closed = true;
    if (this._started && !this._response.writableEnded) {
      this._response.end();
    }
  }

  /** @internal */
  private write(chunk: string): void {
    if (this.closed || this._response.writableEnded) {
      return;
    }
    if (!this._started) {
      this._started = true;
      this._start();
    }
    this._response.write(chunk);
  }
}
