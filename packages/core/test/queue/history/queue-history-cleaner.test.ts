import { configOverrides, createLogger, QueueHistory } from '@appweaver/common';
import { define } from '../../../context/dependency-injection';
import { QueueHistoryCleaner } from '../../../queue/history/queue-history-cleaner';
import { resetContext } from '../../fixtures/context-fixture';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('queue-history-cleaner', () => {
  let prune: jest.Mock;
  let cleaner: QueueHistoryCleaner;

  beforeEach(() => {
    resetContext();
    jest.useFakeTimers({ now: new Date('2026-10-31T12:00:00Z') });
    prune = jest.fn().mockResolvedValue(0);
    define({ prune }, QueueHistory);
    cleaner = new QueueHistoryCleaner();
  });

  afterEach(() => {
    cleaner.onDestroy();
    jest.useRealTimers();
    jest.restoreAllMocks();
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  afterAll(() => {
    resetContext();
  });

  describe('onReady', () => {
    test('prunes once ready, then on every interval', () => {
      configOverrides.QUEUE_HISTORY_CLEANUP_INTERVAL_SECONDS = 60;

      cleaner.onReady();
      expect(prune).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(120_000);
      expect(prune).toHaveBeenCalledTimes(3);
    });

    test('never prunes with a retention of 0 days', () => {
      configOverrides.QUEUE_HISTORY_RETENTION_DAYS = 0;

      cleaner.onReady();
      jest.advanceTimersByTime(7200_000);

      expect(prune).not.toHaveBeenCalled();
    });
  });

  describe('onDestroy', () => {
    test('stops pruning', () => {
      cleaner.onReady();
      cleaner.onDestroy();
      jest.advanceTimersByTime(7200_000);

      expect(prune).toHaveBeenCalledTimes(1);
    });
  });

  describe('prune', () => {
    test('deletes the records finished before the retention period', async () => {
      configOverrides.QUEUE_HISTORY_RETENTION_DAYS = 7;
      prune.mockResolvedValue(4);
      const debug = jest
        .spyOn(createLogger('queue'), 'debug')
        .mockImplementation(() => undefined);

      await expect(cleaner.prune()).resolves.toBe(4);

      expect(prune).toHaveBeenCalledWith(new Date(Date.now() - 7 * DAY_MS));
      expect(debug).toHaveBeenCalledWith(
        expect.objectContaining({ count: 4 }),
        'Queue history pruned'
      );
    });

    test('logs a failed deletion', async () => {
      prune.mockRejectedValue(new Error('database down'));
      const warn = jest
        .spyOn(createLogger('queue'), 'warn')
        .mockImplementation(() => undefined);

      await expect(cleaner.prune()).resolves.toBe(0);

      expect(warn).toHaveBeenCalledWith(
        { err: expect.any(Error) },
        'Queue history pruning failed'
      );
    });
  });
});
