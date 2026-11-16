import type { WebSocket } from 'ws';
import { RealtimeCloseCode, RealtimeServerMessage } from '../types';
import { ConnectionAuth, RealtimeConnection } from '../gateway/connection';

/** A connection of the WebSocket transport, sending every message as a JSON text frame. */
export class WsConnection extends RealtimeConnection {
  public readonly transport = 'websocket' as const;

  /** @internal */
  private _alive: boolean = true;

  constructor(
    auth: ConnectionAuth,
    private readonly _socket: WebSocket
  ) {
    super(auth);
    _socket.on('pong', () => {
      this._alive = true;
    });
  }

  public send(message: RealtimeServerMessage): void {
    if (!this.closed && this._socket.readyState === this._socket.OPEN) {
      this._socket.send(JSON.stringify(message));
    }
  }

  public heartbeat(): void {
    if (this.closed || this._socket.readyState !== this._socket.OPEN) {
      return;
    }
    // A client that answered no ping since the last heartbeat is gone
    if (!this._alive) {
      this._socket.terminate();
      return;
    }
    this._alive = false;
    this._socket.ping();
  }

  public bufferedAmount(): number {
    return this._socket.bufferedAmount;
  }

  public close(code: RealtimeCloseCode, reason: string): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this._socket.close(code, reason);
  }
}
