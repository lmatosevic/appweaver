import os from 'node:os';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  createLogger,
  Queue,
  QueueHistory,
  QueueJob,
  QueueJobError,
  QueueJobFinished,
  QueueJobOptions,
  QueueJobSent,
  QueueProcessor,
  QueueWorkerOptions,
  uuid,
  uuid7
} from '@appweaver/common';
import {
  afterCommit,
  afterRollback,
  currentApiKey,
  currentAuthSource,
  currentAuthType,
  currentAuthUser,
  currentTransaction,
  inject,
  runOutsideTransaction
} from '../../context';
import { selectedProvider } from '../../app/load-providers';
import { queueConfig } from '../queue-config';
import { queueHistoryConfig } from '../queue-history-config';

const logger = createLogger('queue');

const instance = `${os.hostname()}:${process.pid}`;

// The source file of this module without its extension, whose frames the caller site skips
const ownSource = __filename.replace(/\.[cm]?[jt]s$/, '');

type SentJob<Data> = { data: Data; name?: string; options?: QueueJobOptions };

// The record of the job a worker processes, so the jobs it sends name it as their parent
const runningJob = new AsyncLocalStorage<{
  id: Promise<string | undefined>;
}>();

/**
 * Records every job of the queues in the queue history, whichever driver runs them: who sent a job, each attempt,
 * its error and the result. A failing write is logged and never fails the job.
 *
 * @param {Queue} queue - The queue of the selected driver.
 * @return {Queue} The queue recording its jobs.
 */
export default function withQueueHistory(queue: Queue): Queue {
  const recorder = new QueueHistoryRecorder(selectedProvider(Queue));
  const processors = new WeakMap<QueueProcessor, QueueProcessor>();

  return delegate(queue, {
    get: (name: string) => {
      const processor = queue.get(name);
      if (!recorder.records(name)) {
        return processor;
      }
      let wrapped = processors.get(processor);
      if (!wrapped) {
        wrapped = recorder.wrap(processor, name);
        processors.set(processor, wrapped);
      }
      return wrapped;
    }
  });
}

/** Writes the records of the jobs, the ones of a job one after another. */
export class QueueHistoryRecorder {
  /** @internal */
  private readonly _writes = new Map<string, Promise<unknown>>();
  /** @internal */
  private readonly _stalledWatched = new WeakSet<QueueProcessor>();

  constructor(private readonly driver?: string) {}

  /**
   * Checks if the jobs of a queue are recorded, by the `queue.history.queues` and `queue.history.excludeQueues`
   * config.
   *
   * @param {string} queue - The queue name.
   * @return {boolean} `true` if they are recorded.
   */
  public records(queue: string): boolean {
    const { QUEUES, EXCLUDE_QUEUES } = queueHistoryConfig;
    return (
      (QUEUES.length === 0 || QUEUES.includes(queue)) &&
      !EXCLUDE_QUEUES.includes(queue)
    );
  }

  /**
   * Wraps the processor of a queue, so the jobs it sends and its workers process are recorded.
   *
   * @param {QueueProcessor} processor - The processor of the driver.
   * @param {string} queue - The queue name.
   * @return {QueueProcessor} The processor recording its jobs.
   */
  public wrap(processor: QueueProcessor, queue: string): QueueProcessor {
    return delegate(processor, {
      sendJob: async (
        data: unknown,
        name?: string,
        options?: QueueJobOptions
      ) => {
        const site = callerSite();
        const [job] = await this.send(
          processor,
          queue,
          [{ data, name, options }],
          site,
          async ([sent]) => [
            await processor.sendJob(sent.data, sent.name, sent.options)
          ]
        );
        return job;
      },
      sendBulkJobs: (jobs: SentJob<unknown>[]) =>
        this.send(processor, queue, jobs, callerSite(), (sent) =>
          processor.sendBulkJobs(sent)
        ),
      addWorker: (
        handler: (job: QueueJob) => Promise<unknown>,
        options?: QueueWorkerOptions
      ) => {
        this.watchStalled(processor, queue);
        return processor.addWorker(
          (job: QueueJob) => this.process(processor, queue, job, handler),
          options
        );
      }
    });
  }

  /**
   * Records the jobs sent to a queue, then sends them with their job ids, generating the missing ones, and the ids of
   * their records as their `historyId`. Outside of a transaction they are recorded before they are sent, so no worker
   * starts them first, and inside one once it settles, since a query outside of it could wait for it. A send the queue
   * ignores, since a job with its id is still in it, keeps its record, marked `ignored` and linked to the record of
   * that job.
   *
   * @internal
   */
  public async send<Data, Job extends QueueJob>(
    processor: QueueProcessor,
    queue: string,
    jobs: SentJob<Data>[],
    site: string | undefined,
    sendJobs: (jobs: SentJob<Data>[]) => Promise<Job[]>
  ): Promise<Job[]> {
    const sentAt = new Date();
    const caller = await this.caller(site);
    const records = jobs.map(
      (job): QueueJobSent => ({
        id: uuid7(),
        queue,
        jobId: job.options?.jobId ?? uuid(),
        name: job.name ?? 'defaultJob',
        sentAt,
        caller,
        driver: this.driver,
        data: queueHistoryConfig.STORE_DATA ? payload(job.data) : undefined,
        metadata: job.options?.metadata,
        options: jobOptions(job.options),
        priority: job.options?.priority,
        maxAttempts: job.options?.attempts ?? queueConfig.RETRY_ATTEMPTS,
        scheduledAt: job.options?.delay
          ? new Date(sentAt.getTime() + job.options.delay)
          : undefined
      })
    );
    const sent = jobs.map(({ data, name, options = {} }, i) => {
      const { metadata: _metadata, ...driverOptions } = options;
      return {
        data,
        name,
        options: {
          ...driverOptions,
          jobId: records[i].jobId,
          historyId: records[i].id
        }
      };
    });
    // The job in the queue a send was ignored for: one of another record, or without a record one older than the send
    const ignoredBy = (added: Job[]) =>
      added.map((job, i) => {
        const { historyId, createdAt } = processor.jobInfo(job);
        if (historyId !== undefined) {
          return historyId === records[i].id ? undefined : { historyId };
        }
        return createdAt !== undefined && createdAt < sentAt.getTime()
          ? { createdAt: new Date(createdAt) }
          : undefined;
      });

    if (currentTransaction()) {
      const added = await sendJobs(sent);
      const ignored = ignoredBy(added);
      // After the writes of their workers in this process, never delaying the commit. A job already in the queue has
      // no worker to record it first
      const keys = records.map((record) => jobKey(queue, record.jobId));
      const record = () =>
        void this.serial(keys, async () => {
          const history = inject(QueueHistory);
          const taken = records.filter((_, i) => !ignored[i]);
          const repeated = records.filter((_, i) => ignored[i]);
          if (taken.length) {
            await this.write(() => history.recordSent(taken, { sent: true }));
          }
          if (repeated.length) {
            await this.write(() => history.recordSent(repeated));
            for (const [i, record] of records.entries()) {
              const job = ignored[i];
              if (job) {
                await this.write(() => history.recordIgnored(record.id, job));
              }
            }
          }
        });
      afterCommit(record);
      afterRollback(record);
      return added;
    }

    await this.write(() => inject(QueueHistory).recordSent(records));
    let added: Job[];
    try {
      added = await sendJobs(sent);
    } catch (error) {
      const finishedAt = new Date();
      for (const { id } of records) {
        void this.write(() =>
          inject(QueueHistory).recordFinished(id, {
            state: 'failed',
            attempt: 0,
            finishedAt,
            durationMs: 0,
            error: jobError(error, 0)
          })
        );
      }
      throw error;
    }

    for (const [i, job] of ignoredBy(added).entries()) {
      if (job) {
        const { id, jobId } = records[i];
        void this.serial(jobKey(queue, jobId), () =>
          inject(QueueHistory).recordIgnored(id, job)
        );
      }
    }
    return added;
  }

  /**
   * Processes a job with the handler of a worker, recording its attempt and its outcome. The handler runs while the
   * start is recorded, and the outcome is written after it, so neither delays the job.
   *
   * @internal
   */
  public async process<Job extends QueueJob>(
    processor: QueueProcessor,
    queue: string,
    job: Job,
    handler: (job: Job) => Promise<unknown>
  ): Promise<unknown> {
    const {
      attempt = 1,
      maxAttempts,
      createdAt,
      historyId
    } = processor.jobInfo(job);
    const jobId = String(job.id ?? '');
    const key = jobKey(queue, jobId);
    const startedAt = new Date();
    const start = performance.now();

    const id = this.serial(key, () =>
      inject(QueueHistory).recordStarted({
        queue,
        jobId,
        name: job.name,
        attempt,
        startedAt,
        instance,
        driver: this.driver,
        maxAttempts,
        id: historyId,
        createdAt: createdAt === undefined ? undefined : new Date(createdAt),
        data: queueHistoryConfig.STORE_DATA ? payload(job.data) : undefined
      })
    );
    const finish = (
      outcome: Omit<QueueJobFinished, 'finishedAt' | 'durationMs' | 'attempt'>
    ) =>
      void this.serial(key, async () => {
        const recordId = await id;
        if (recordId) {
          await inject(QueueHistory).recordFinished(recordId, {
            ...outcome,
            attempt,
            finishedAt: new Date(),
            durationMs: Math.round(performance.now() - start)
          });
        }
      });

    let result: unknown;
    try {
      result = await runningJob.run({ id }, () => handler(job));
    } catch (error) {
      const final =
        maxAttempts === undefined ||
        attempt >= maxAttempts ||
        (error as Error)?.name === 'UnrecoverableError';
      finish({
        state: final ? 'failed' : 'retrying',
        error: jobError(error, attempt)
      });
      throw error;
    }

    finish({
      state: 'completed',
      result: queueHistoryConfig.STORE_RESULT ? payload(result) : undefined
    });
    return result;
  }

  /** @internal */
  private watchStalled(processor: QueueProcessor, queue: string): void {
    if (this._stalledWatched.has(processor)) {
      return;
    }
    this._stalledWatched.add(processor);
    processor.onStalled((jobId) => {
      void this.serial(jobKey(queue, String(jobId)), () =>
        inject(QueueHistory).recordStalled(queue, String(jobId))
      );
    });
  }

  /** @internal */
  private async caller(
    site: string | undefined
  ): Promise<QueueJobSent['caller']> {
    const user = currentAuthUser();
    const apiKey = currentApiKey<{ id?: string | number }>();
    const parent = runningJob.getStore();
    return {
      instance,
      userId: user ? String(user.id) : undefined,
      authType: currentAuthType() ?? undefined,
      authSource: currentAuthSource() ?? undefined,
      apiKeyId: apiKey?.id == null ? undefined : String(apiKey.id),
      parentId: parent ? await parent.id : undefined,
      site
    };
  }

  /**
   * Runs a write after the previous writes of the same jobs, so an outcome never lands before its start.
   *
   * @internal
   */
  private serial<T>(
    keys: string | string[],
    fn: () => Promise<T>
  ): Promise<T | undefined> {
    const jobKeys = [keys].flat();
    const previous = Promise.all(
      jobKeys.map((key) => this._writes.get(key) ?? Promise.resolve())
    );
    const next = previous.then(() => this.write(fn));
    for (const key of jobKeys) {
      this._writes.set(key, next);
    }
    void next.then(() => {
      for (const key of jobKeys) {
        if (this._writes.get(key) === next) {
          this._writes.delete(key);
        }
      }
    });
    return next;
  }

  /**
   * Runs a write outside of the current transaction, logging its error instead of throwing it.
   *
   * @internal
   */
  private async write<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await runOutsideTransaction(fn);
    } catch (error) {
      logger.warn({ err: error }, 'Queue history write failed');
      return undefined;
    }
  }
}

/** The key of a job, whose writes run one after another. */
function jobKey(queue: string, jobId: string): string {
  return `${queue}\u0000${jobId}`;
}

/**
 * Returns a proxy of an object with some of its methods replaced, its other methods bound to the object itself, so
 * the members of the driver, private ones included, keep working.
 */
function delegate<T extends object>(
  target: T,
  overrides: Record<string, unknown>
): T {
  return new Proxy(target, {
    get(object, property) {
      if (typeof property === 'string' && Object.hasOwn(overrides, property)) {
        return overrides[property];
      }
      const value = Reflect.get(object, property);
      return typeof value === 'function' && property !== 'constructor'
        ? value.bind(object)
        : value;
    }
  });
}

/** The job options worth recording, without the options of the driver. */
function jobOptions(
  options: QueueJobOptions = {}
): Record<string, unknown> | undefined {
  const { delay, attempts, backoff, priority } = options;
  const recorded = Object.fromEntries(
    Object.entries({ delay, attempts, backoff, priority }).filter(
      ([, value]) => value !== undefined
    )
  );
  return Object.keys(recorded).length ? recorded : undefined;
}

/** A payload or a result as stored, its JSON form, or a marker when it is too large or not serializable. */
function payload(value: unknown): unknown {
  if (value === undefined) {
    return undefined;
  }
  let json: string | undefined;
  try {
    json = JSON.stringify(value);
  } catch {
    return { unserializable: true };
  }
  if (json === undefined) {
    return undefined;
  }
  const bytes = Buffer.byteLength(json);
  if (bytes > queueHistoryConfig.MAX_PAYLOAD_BYTES) {
    return { truncated: true, bytes };
  }
  return JSON.parse(json);
}

/** The error of an attempt as stored. */
function jobError(error: unknown, attempt: number): QueueJobError {
  if (!(error instanceof Error)) {
    return {
      attempt,
      at: new Date().toISOString(),
      message: typeof error === 'string' ? error : JSON.stringify(error)
    };
  }
  const { code } = error as Error & { code?: string | number };
  return {
    attempt,
    at: new Date().toISOString(),
    message: error.message,
    name: error.name,
    code: code === undefined ? undefined : String(code),
    stack: error.stack
  };
}

/**
 * Returns the `file:line:column` of the code sending a job, the first frame outside of this module, the packages and
 * Node itself, with `queue.history.recordCallerSite` only.
 */
function callerSite(): string | undefined {
  if (!queueHistoryConfig.RECORD_CALLER_SITE) {
    return undefined;
  }
  const frames = new Error().stack?.split('\n').slice(1) ?? [];
  for (const frame of frames) {
    const location = /\(?((?:file:\/\/)?[^\s()]+:\d+:\d+)\)?$/
      .exec(frame.trim())?.[1]
      ?.replace(/^file:\/\//, '');
    if (
      !location ||
      location.startsWith('node:') ||
      location.startsWith(ownSource) ||
      location.includes(`${path.sep}node_modules${path.sep}`)
    ) {
      continue;
    }
    return path.relative(process.cwd(), location);
  }
  return undefined;
}
