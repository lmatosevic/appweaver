import { AuthUser, uuid } from '@appweaver/common';
import { InputStream } from '../stream/input-stream';
import { StreamInstance } from '../stream/stream-instance';
import { RealtimeAction } from '../types';

/**
 * A call of an action with a stream or an input, over the WebSocket or HTTP, from its start until it ends. The
 * gateway keeps them by user, so a user logging out, disabled or losing the access of the action ends their calls at
 * once, on every instance.
 */
export class ActionCall {
  /** The ID of the call, the ID of its stream when it has one */
  public readonly id: string;
  /** The ID of the WebSocket connection calling the action, none over HTTP */
  public connectionId?: string;
  /** The error the call failed with, i.e. its user lost the access of the action */
  public error?: unknown;

  /** @internal */
  private readonly _controller = new AbortController();

  /**
   * @param {RealtimeAction} action - The action.
   * @param {AuthUser | null} user - The user calling the action, null when anonymous.
   * @param {StreamInstance} [output] - The stream of the chunks of the handler.
   * @param {InputStream} [input] - The chunks the client streams.
   */
  constructor(
    public readonly action: RealtimeAction,
    public user: AuthUser | null,
    public readonly output?: StreamInstance,
    public readonly input?: InputStream
  ) {
    this.id = output?.streamId ?? uuid();
    output?.signal.addEventListener('abort', () => this.abort(), {
      once: true
    });
  }

  /** The ID of the user, null when anonymous. */
  public get userId(): string | null {
    return this.user ? String(this.user.id) : null;
  }

  /** Aborted once the call ends, is cancelled or fails: the handler stops. */
  public get signal(): AbortSignal {
    return this._controller.signal;
  }

  /** Whether the call ended. */
  public get ended(): boolean {
    return this._controller.signal.aborted;
  }

  /** Cancels the call, by its client. */
  public cancel(): void {
    if (this.ended) {
      return;
    }
    // The input first, before the end of the stream aborts the call
    this.input?.fail(abortError('Realtime call cancelled'));
    this.output?.cancel();
    this.abort();
  }

  /**
   * Ends the call with an error, sent to the client: its user lost the access, its input failed, its connection was
   * lost while it streamed its input.
   *
   * @param {unknown} error - The error.
   */
  public fail(error: unknown): void {
    if (this.ended) {
      return;
    }
    this.error = error;
    this.input?.fail(error);
    this.output?.error(error);
    this.abort();
  }

  /** Marks the call ended once its handler returned, without a stream. */
  public finish(): void {
    this.abort();
  }

  /** @internal */
  private abort(): void {
    if (!this._controller.signal.aborted) {
      this.input?.fail(abortError('Realtime call ended'));
      this._controller.abort();
    }
  }
}

function abortError(message: string): Error {
  return Object.assign(new Error(message), { name: 'AbortError' });
}
