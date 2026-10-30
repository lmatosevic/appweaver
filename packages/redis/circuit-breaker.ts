/** The callbacks of the state changes of a {@link CircuitBreaker}. */
export type CircuitBreakerListener = {
  onOpen?: (failures: number) => void;
  onClose?: () => void;
};

/**
 * Stops the calls to a failing service. It opens after `threshold` consecutive
 * failures and rejects the calls for `cooldown` milliseconds, then lets one
 * call through to probe the service: a success closes it, a failure keeps it
 * open for another cooldown. A threshold of `0` never opens it.
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

  /**
   * Checks whether a call may run. Once the cooldown elapsed it allows the
   * call as the probe and restarts the cooldown, so the other calls keep
   * being rejected until the probe succeeds.
   */
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

  /** Records a successful call, which closes the breaker. */
  public success(): void {
    this._failures = 0;
    if (this._openedAt !== undefined) {
      this._openedAt = undefined;
      this.listener.onClose?.();
    }
  }

  /** Records a failed call, which opens the breaker at the threshold. */
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
