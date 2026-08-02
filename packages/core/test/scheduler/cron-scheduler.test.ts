import { CronScheduler } from '../../scheduler/cron-scheduler';

describe('cron-scheduler', () => {
  let scheduler: CronScheduler;

  beforeEach(() => {
    scheduler = new CronScheduler();
  });

  afterEach(async () => {
    await scheduler.stopAll();
  });

  const job = (onTick = jest.fn()) => ({
    cronTime: '0 0 * * *',
    onTick,
    start: false
  });

  describe('addJob', () => {
    test('registers a job and returns its id', () => {
      const jobId = scheduler.addJob(job());

      expect(typeof jobId).toBe('string');
      expect(scheduler.getJob(jobId)).toBeDefined();
    });

    test('registers every job under its own id', () => {
      const first = scheduler.addJob(job());
      const second = scheduler.addJob(job());

      expect(first).not.toBe(second);
      expect(scheduler.getJob(first)).not.toBe(scheduler.getJob(second));
    });

    test('creates the job with the configured cron time', () => {
      const jobId = scheduler.addJob(job());

      expect(scheduler.getJob(jobId)!.cronTime.source).toBe('0 0 * * *');
    });
  });

  describe('getJob', () => {
    test('returns undefined for an unknown job id', () => {
      expect(scheduler.getJob('missing')).toBeUndefined();
    });
  });

  describe('startJob / stopJob', () => {
    test('starts a registered job', () => {
      const jobId = scheduler.addJob(job());

      expect(scheduler.startJob(jobId)).toBe(true);
      expect(scheduler.getJob(jobId)!.isActive).toBe(true);
    });

    test('stops a running job', async () => {
      const jobId = scheduler.addJob(job());
      scheduler.startJob(jobId);

      await expect(scheduler.stopJob(jobId)).resolves.toBe(true);
      expect(scheduler.getJob(jobId)!.isActive).toBe(false);
    });

    test('returns false for an unknown job id', async () => {
      expect(scheduler.startJob('missing')).toBe(false);
      await expect(scheduler.stopJob('missing')).resolves.toBe(false);
    });
  });

  describe('startAll', () => {
    test('starts every registered job', () => {
      const first = scheduler.addJob(job());
      const second = scheduler.addJob(job());

      scheduler.startAll();

      expect(scheduler.getJob(first)!.isActive).toBe(true);
      expect(scheduler.getJob(second)!.isActive).toBe(true);
    });

    test('keeps already running jobs running', () => {
      const jobId = scheduler.addJob(job());
      scheduler.startJob(jobId);

      scheduler.startAll();

      expect(scheduler.getJob(jobId)!.isActive).toBe(true);
    });
  });

  describe('stopAll', () => {
    test('stops every running job', async () => {
      const first = scheduler.addJob(job());
      const second = scheduler.addJob(job());
      scheduler.startAll();

      await scheduler.stopAll();

      expect(scheduler.getJob(first)!.isActive).toBe(false);
      expect(scheduler.getJob(second)!.isActive).toBe(false);
    });

    test('does nothing without registered jobs', async () => {
      await expect(scheduler.stopAll()).resolves.toBeUndefined();
    });
  });

  describe('removeJob', () => {
    test('stops and removes a job', async () => {
      const jobId = scheduler.addJob(job());
      scheduler.startJob(jobId);

      await expect(scheduler.removeJob(jobId)).resolves.toBe(true);
      expect(scheduler.getJob(jobId)).toBeUndefined();
    });

    test('returns false for an unknown job id', async () => {
      await expect(scheduler.removeJob('missing')).resolves.toBe(false);
    });
  });

  describe('onDestroy', () => {
    test('stops every job', async () => {
      const jobId = scheduler.addJob(job());
      scheduler.startAll();

      await scheduler.onDestroy();

      expect(scheduler.getJob(jobId)!.isActive).toBe(false);
    });
  });

  describe('job execution', () => {
    test('runs the job handler on tick', async () => {
      const onTick = jest.fn();
      const jobId = scheduler.addJob({
        cronTime: '* * * * * *',
        onTick,
        start: false
      });

      const cronJob = scheduler.getJob(jobId)!;
      await cronJob.fireOnTick();

      expect(onTick).toHaveBeenCalled();
    });
  });
});
