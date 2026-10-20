import { Queue } from '@appweaver/common';
import { ContractFactory } from './contract-util';

/**
 * Tests a `Queue` driver against the behavior every driver shares, with the `describe` and `test` globals of Jest,
 * Vitest or Bun. Each test gets a fresh instance, whose queues are closed after it.
 *
 * @param {string} name - The name of the driver, i.e. `BullQueue`.
 * @param {ContractFactory<Queue>} create - Creates the driver.
 */
export function testQueueContract(
  name: string,
  create: ContractFactory<Queue>
): void {
  describe(`${name} implements the Queue contract`, () => {
    let queue: Queue;

    beforeEach(async () => {
      queue = await create();
    });

    afterEach(async () => {
      await queue.closeAll();
    });

    test('processes a job with a worker and reports its result', async () => {
      const processor = queue.get<{ value: number }, number>('contract-jobs');
      const completed = new Promise<number>((resolve) => {
        processor.onCompleted((_, result) => resolve(result));
      });

      processor.addWorker(async (job) => job.data.value * 2);
      await processor.sendJob({ value: 21 }, 'double');

      await expect(completed).resolves.toBe(42);
    });

    test('reports a failed job', async () => {
      const processor = queue.get('contract-failures');
      const failed = new Promise<string>((resolve) => {
        processor.onFailed((_, error) => resolve(error.message));
      });

      processor.addWorker(async () => {
        throw new Error('broken');
      });
      await processor.sendJob({}, 'fail', { attempts: 1 });

      await expect(failed).resolves.toBe('broken');
    });

    test('closes a queue by its name', async () => {
      queue.get('contract-closed');

      await expect(queue.close('contract-closed')).resolves.toBe(true);
    });

    test('reports its health', async () => {
      await expect(queue.checkHealth()).resolves.toMatchObject({
        success: true
      });
    });
  });
}
