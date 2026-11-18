import { StreamFrameLike, StreamSink, StreamStart } from '../stream/types';
import { RealtimeConnection } from './connection';

/**
 * A subscriber of a stream writing to a realtime connection, for one subscription: the frames as they were encoded,
 * the start and the gaps as the messages of the subscription.
 */
export class ConnectionSink implements StreamSink {
  /**
   * @param {RealtimeConnection} _connection - The connection.
   * @param {string} _id - The ID of the subscription, or of the call of a streaming action.
   * @param {Function} _overflow - Closes the connection reading too slowly.
   * @param {Function} [_finish] - Called once a stream ended for the subscription.
   */
  constructor(
    private readonly _connection: RealtimeConnection,
    private readonly _id: string,
    private readonly _overflow: () => void,
    private readonly _finish?: (sid: number) => void
  ) {}

  public start(start: StreamStart): void {
    this._connection.send({
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
    this._connection.sendFrame(frame);
  }

  public gap(sid: number, from: number, to: number): void {
    this._connection.send({ type: 'stream.gap', sid, from, to });
  }

  public bufferedAmount(): number {
    return this._connection.bufferedAmount();
  }

  public overflow(): void {
    this._overflow();
  }

  public finish(sid: number): void {
    this._finish?.(sid);
  }
}
