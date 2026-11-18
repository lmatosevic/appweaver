import { StreamFrameLike, StreamFrameMessage } from './types';

/** A frame of a stream, its JSON and its Server-Sent Event encoded once, however many subscribers receive it. */
export class StreamFrame implements StreamFrameLike {
  /** @internal */
  private _json?: string;
  /** @internal */
  private _sse?: string;

  constructor(public readonly message: StreamFrameMessage) {}

  public get json(): string {
    return (this._json ??= JSON.stringify(this.message));
  }

  public get sse(): string {
    return (this._sse ??= `data: ${this.json}\n\n`);
  }
}
