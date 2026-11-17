import { RealtimeConnection } from '../../gateway/connection';
import { RealtimeCloseCode, RealtimeServerMessage } from '../../types';

/** A connection recording the messages it sends. */
export class FakeConnection extends RealtimeConnection {
  public readonly transport = 'websocket' as const;
  public readonly messages: RealtimeServerMessage[] = [];
  public readonly heartbeats: number[] = [];
  public closedWith?: [RealtimeCloseCode, string];
  public buffered: number = 0;

  constructor(
    user: any = { id: 1, email: 'u@test.com', roles: [] },
    expiresAt: number | null = null
  ) {
    super({ user, authType: null, authSource: null, expiresAt });
  }

  public send(message: RealtimeServerMessage): void {
    this.messages.push(message);
  }

  public heartbeat(): void {
    this.heartbeats.push(Date.now());
  }

  public bufferedAmount(): number {
    return this.buffered;
  }

  public close(code: RealtimeCloseCode, reason: string): void {
    this.closed = true;
    this.closedWith = [code, reason];
  }
}
