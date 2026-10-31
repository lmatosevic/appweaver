/** The callbacks of the state changes of a {@link CircuitBreaker}. */
export type CircuitBreakerListener = {
  onOpen?: (failures: number) => void;
  onClose?: () => void;
};

/**
 * Opens after `threshold` consecutive failures and rejects the calls for
 * `cooldown` ms, then lets one call through as a probe. A threshold of `0`
 * never opens it.
 */
export class CircuitBreaker {
  /** @internal */
  private _failures: number = 0;
  /** @internal */
  private _openedAt?: number;

  constructor(
    private readonly threshold: number,
    private readonly cooldown: number,
    private readonly listener: CircuitBreakerListener = {}
  ) {}

  /** Whether the calls are rejected, `false` once the cooldown allows a probe. */
  public isOpen(): boolean {
    return this._openedAt !== undefined && this.remaining() > 0;
  }

  /** Milliseconds until the next probe, `0` while the breaker is closed. */
  public remaining(): number {
    if (this._openedAt === undefined) {
      return 0;
    }
    return Math.max(0, this._openedAt + this.cooldown - Date.now());
  }

  /** Checks whether a call may run, letting one probe through per cooldown. */
  public acquire(): boolean {
    if (this._openedAt === undefined) {
      return true;
    }
    if (this.isOpen()) {
      return false;
    }
    this._openedAt = Date.now();
    return true;
  }

  public success(): void {
    this._failures = 0;
    if (this._openedAt !== undefined) {
      this._openedAt = undefined;
      this.listener.onClose?.();
    }
  }

  public failure(): void {
    if (this.threshold <= 0) {
      return;
    }
    this._failures++;
    if (this._openedAt !== undefined) {
      // A failed probe keeps the breaker open for another cooldown
      this._openedAt = Date.now();
    } else if (this._failures >= this.threshold) {
      this._openedAt = Date.now();
      this.listener.onOpen?.(this._failures);
    }
  }
}
