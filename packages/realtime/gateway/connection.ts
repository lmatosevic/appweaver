import { AuthSource, AuthType, AuthUser, uuidv4 } from '@appweaver/common';
import { StreamFrameLike } from '../stream/types';
import { RealtimeCloseCode, RealtimeServerMessage } from '../types';
import { ActiveSubscription } from './subscription';

/** The authentication a connection was opened with. */
export type ConnectionAuth = {
  /** The user, null for an anonymous connection */
  user: AuthUser | null;
  /** How the user authenticated */
  authType: AuthType | null;
  /** The source of the authentication */
  authSource: AuthSource | null;
  /** The epoch milliseconds the credentials of the user expire at, null when they do not expire */
  expiresAt: number | null;
};

/**
 * A realtime connection of a client, over a transport: the Server-Sent Events of `sse` or the `websocket`. The
 * gateway tracks its subscriptions and closes it when its credentials expire or it falls behind.
 */
export abstract class RealtimeConnection {
  /** The ID of the connection */
  public readonly id: string = uuidv4();
  /** The subscriptions of the connection, by their IDs */
  public readonly subscriptions = new Map<string, ActiveSubscription>();
  /** The epoch milliseconds the connection was opened at */
  public readonly openedAt: number = Date.now();
  /** Whether the connection is closed */
  public closed: boolean = false;
  /** The IP address of the client, limiting its anonymous connections */
  public ip?: string;

  /** The transport of the connection */
  public abstract readonly transport: 'sse' | 'websocket';

  constructor(public readonly auth: ConnectionAuth) {}

  /** The user of the connection, null when anonymous. */
  public get user(): AuthUser | null {
    return this.auth.user;
  }

  /**
   * Sends a message to the client.
   *
   * @param {RealtimeServerMessage} message - The message.
   */
  public abstract send(message: RealtimeServerMessage): void;

  /**
   * Sends a frame of a stream, encoded once for every subscriber. A transport sends its encoding as it is.
   *
   * @param {StreamFrameLike} frame - The frame.
   */
  public sendFrame(frame: StreamFrameLike): void {
    this.send(frame.message);
  }

  /** Sends a heartbeat, keeping the connection open through the proxies. */
  public abstract heartbeat(): void;

  /** The bytes waiting to be sent to the client. */
  public abstract bufferedAmount(): number;

  /**
   * Closes the connection.
   *
   * @param {RealtimeCloseCode} code - Why the connection is closed.
   * @param {string} reason - The reason, readable by a person.
   */
  public abstract close(code: RealtimeCloseCode, reason: string): void;
}
