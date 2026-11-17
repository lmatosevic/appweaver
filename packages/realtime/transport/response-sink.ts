import { ServerResponse } from 'node:http';
import { StreamFrameLike, StreamSink, StreamStart } from '../stream/types';

/**
 * A subscriber of the stream of a streaming action called over HTTP, writing it as the Server-Sent Events of the
 * response, which ends with the stream.
 */
export class ResponseSink implements StreamSink {
  /**
   * @param {ServerResponse} _response - The response.
   * @param {string} _id - The name of the action, the ID of the stream messages.
   * @param {Function} _start - Writes the head of the response, called before the first event.
   */
  constructor(
    private readonly _response: ServerResponse,
    private readonly _id: string,
    private readonly _start: () => void
  ) {}

  public start(start: StreamStart): void {
    this._start();
    this.send({
      type: 'stream.start',
      id: this._id,
      sid: start.sid,
      streamId: start.streamId,
      stream: start.name,
      key: start.key,
      codec: start.codec,
      ...(start.mimeType ? { mimeType: start.mimeType } : {}),
      seq: start.seq
    });
  }

  public write(frame: StreamFrameLike): void {
    this.writeText(frame.sse);
  }

  public gap(sid: number, from: number, to: number): void {
    this.send({ type: 'stream.gap', sid, from, to });
  }

  public bufferedAmount(): number {
    return this._response.writableLength;
  }

  public overflow(): void {
    this.end();
  }

  public finish(): void {
    this.end();
  }

  /** @internal */
  private send(message: object): void {
    this.writeText(`data: ${JSON.stringify(message)}\n\n`);
  }

  /** @internal */
  private writeText(text: string): void {
    if (!this._response.writableEnded && !this._response.destroyed) {
      this._response.write(text);
    }
  }

  /** @internal */
  private end(): void {
    if (!this._response.writableEnded) {
      this._response.end();
    }
  }
}
