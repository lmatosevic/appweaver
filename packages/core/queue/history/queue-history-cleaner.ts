import {
  createLogger,
  LIFECYCLE,
  OnDestroy,
  OnReady,
  QueueHistory
} from '@appweaver/common';
import { inject } from '../../context';
import { queueHistoryConfig } from '../queue-history-config';

const logger = createLogger('queue');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deletes the records of the finished jobs past the `queue.history.retentionDays` config, once ready and then on an interval. */
export class QueueHistoryCleaner implements OnReady, OnDestroy {
  static [LIFECYCLE] = true;

  /** @internal */
  private readonly _history = inject(QueueHistory);
  /** @internal */
  private _timer?: NodeJS.Timeout;

  public onReady(): void {
    if (queueHistoryConfig.RETENTION_DAYS === 0) {
      return;
    }
    // Never keeps the process running, i.e. a task of `weaver run`
    this._timer = setInterval(
      () => void this.prune(),
      queueHistoryConfig.CLEANUP_INTERVAL_SECONDS * 1000
    ).unref();
    void this.prune();
  }

  public onDestroy(): void {
    clearInterval(this._timer);
    this._timer = undefined;
  }

  /**
   * Deletes the records of the jobs finished before the retention period, logging an error instead of throwing it.
   *
   * @return {Promise<number>} The number of deleted records.
   */
  public async prune(): Promise<number> {
    const before = new Date(
      Date.now() - queueHistoryConfig.RETENTION_DAYS * DAY_MS
    );
    try {
      const count = await this._history.prune(before);
      if (count > 0) {
        logger.debug({ count, before }, 'Queue history pruned');
      }
      return count;
    } catch (error) {
      logger.warn({ err: error }, 'Queue history pruning failed');
      return 0;
    }
  }
}
