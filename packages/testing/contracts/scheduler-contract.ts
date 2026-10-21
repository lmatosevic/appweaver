import { Scheduler } from '@appweaver/common';
import { ContractFactory, runner } from './contract-util';

/**
 * Tests a `Scheduler` driver against the behavior every driver shares, with the `describe` and `test` globals of
 * Jest, Vitest or Bun. The jobs run once a year, so none of them ticks during the tests.
 *
 * @param {string} name - The name of the driver, i.e. `CronScheduler`.
 * @param {ContractFactory<Scheduler>} create - Creates the driver.
 */
export function testSchedulerContract(
  name: string,
  create: ContractFactory<Scheduler>
): void {
  const { describe, test, expect, beforeEach, afterEach } = runner();

  describe(`${name} implements the Scheduler contract`, () => {
    let scheduler: Scheduler;

    beforeEach(async () => {
      scheduler = await create();
    });

    afterEach(async () => {
      await scheduler.onDestroy();
    });

    test('adds a job and returns it by its id', () => {
      const jobId = scheduler.addJob({
        cronTime: '0 0 1 1 *',
        onTick: () => undefined,
        timeZone: 'UTC'
      });

      expect(typeof jobId).toBe('string');
      expect(scheduler.getJob(jobId)).toBeDefined();
    });

    test('starts, stops and removes a job', async () => {
      const jobId = scheduler.addJob({
        cronTime: '0 0 1 1 *',
        onTick: () => undefined
      });

      expect(scheduler.startJob(jobId)).toBe(true);
      await expect(scheduler.stopJob(jobId)).resolves.toBe(true);
      await expect(scheduler.removeJob(jobId)).resolves.toBe(true);
      expect(scheduler.getJob(jobId)).toBeUndefined();
    });

    test('rejects an unknown job id', async () => {
      expect(scheduler.startJob('unknown')).toBe(false);
      await expect(scheduler.stopJob('unknown')).resolves.toBe(false);
      await expect(scheduler.removeJob('unknown')).resolves.toBe(false);
    });
  });
}
