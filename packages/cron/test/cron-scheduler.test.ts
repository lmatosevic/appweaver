import { CronScheduler } from '../cron-scheduler';
import {
  configOverrides,
  createLogger,
  currentTraceId,
  JobParams,
  SpanStatusCode,
  withSpan
} from '@appweaver/common';
import {
  recordTelemetry,
  TelemetryRecorder,
  testSchedulerContract
} from '@appweaver/testing';

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

    test('stops the running jobs registered after a stopped one', async () => {
      const stopped = scheduler.addJob(job());
      const running = scheduler.addJob(job());
      scheduler.startAll();
      await scheduler.stopJob(stopped);

      await scheduler.stopAll();

      expect(scheduler.getJob(stopped)!.isActive).toBe(false);
      expect(scheduler.getJob(running)!.isActive).toBe(false);
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
        providerOptions: { start: false }
      });

      const cronJob = scheduler.getJob(jobId)!;
      await cronJob.fireOnTick();

      expect(onTick).toHaveBeenCalled();
    });
  });
});

testSchedulerContract('CronScheduler', () => new CronScheduler());

describe('cron-scheduler telemetry', () => {
  let telemetry: TelemetryRecorder;
  let scheduler: CronScheduler;

  const run = async (params: Partial<JobParams>) => {
    const jobId = scheduler.addJob({
      cronTime: '0 0 * * *',
      onTick: () => undefined,
      providerOptions: { start: false },
      ...params
    });
    await scheduler.getJob(jobId)!.fireOnTick();
    return jobId;
  };

  beforeEach(() => {
    telemetry = recordTelemetry();
    scheduler = new CronScheduler();
  });

  afterEach(async () => {
    await scheduler.stopAll();
    await telemetry.stop();
    delete configOverrides.TELEMETRY_INSTRUMENTATIONS_SCHEDULER;
  });

  test('runs a tick in the root span of a new trace, named after the job', async () => {
    let active: string | undefined;

    const jobId = await withSpan('caller', {}, () =>
      run({ name: 'reports:daily', onTick: () => (active = currentTraceId()) })
    );

    const span = telemetry.span('scheduler reports:daily');
    expect(span.parentSpanContext).toBeUndefined();
    expect(active).toBe(span.spanContext().traceId);
    expect(span.attributes).toEqual({
      'appweaver.scheduler.job.id': jobId,
      'appweaver.scheduler.job.name': 'reports:daily',
      'appweaver.scheduler.job.cron': '0 0 * * *'
    });
    const duration = await telemetry.metric('appweaver.scheduler.job.duration');
    expect(duration?.dataPoints[0].attributes).toEqual({
      'appweaver.scheduler.job.name': 'reports:daily'
    });
  });

  test('names the span of a job without a name after its id', async () => {
    const jobId = await run({ cronTime: new Date(Date.now() + 60_000) });

    expect(telemetry.span('scheduler job').attributes).toEqual({
      'appweaver.scheduler.job.id': jobId,
      'appweaver.scheduler.job.name': jobId
    });
  });

  test('records the error of a failed tick', async () => {
    const error = jest
      .spyOn(createLogger('scheduler'), 'error')
      .mockImplementation();

    await run({
      name: 'broken',
      onTick: () => {
        throw new RangeError('no data');
      }
    });

    expect(telemetry.span('scheduler broken').status.code).toBe(
      SpanStatusCode.ERROR
    );
    const duration = await telemetry.metric('appweaver.scheduler.job.duration');
    expect(duration?.dataPoints[0].attributes['error.type']).toBe('RangeError');
    error.mockRestore();
  });

  test('runs the tick without a span with the instrumentation off', async () => {
    configOverrides.TELEMETRY_INSTRUMENTATIONS_SCHEDULER = false;
    const onTick = jest.fn();

    await run({ name: 'quiet', onTick });

    expect(onTick).toHaveBeenCalled();
    expect(telemetry.spans()).toHaveLength(0);
  });
});
