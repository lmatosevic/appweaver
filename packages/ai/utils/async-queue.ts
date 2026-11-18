/**
 * A queue of values read as an async iterable, filled by a producer pushing them, i.e. the parts of a queued stream
 * arriving through the pub/sub. It ends once ended, or throws the error it failed with after its values are read.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  /** @internal */
  private readonly _values: T[] = [];
  /** @internal */
  private _waiting?: () => void;
  /** @internal */
  private _ended = false;
  /** @internal */
  private _error?: { error: unknown };

  /** Adds a value, ignored once the queue ended. */
  public push(value: T): void {
    if (!this._ended) {
      this._values.push(value);
      this.wake();
    }
  }

  /** Ends the queue once its values are read. */
  public end(): void {
    this._ended = true;
    this.wake();
  }

  /** Ends the queue with an error, thrown once its values are read. */
  public fail(error: unknown): void {
    if (!this._ended) {
      this._error = { error };
      this.end();
    }
  }

  public async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      if (this._values.length) {
        yield this._values.shift()!;
      } else if (this._ended) {
        if (this._error) {
          throw this._error.error;
        }
        return;
      } else {
        await new Promise<void>((resolve) => (this._waiting = resolve));
      }
    }
  }

  /** @internal */
  private wake(): void {
    const waiting = this._waiting;
    this._waiting = undefined;
    waiting?.();
  }
}
