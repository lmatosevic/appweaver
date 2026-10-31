# Queue

The queue module provides background job processing with support for workers, retries, and lifecycle event hooks. The
`BullQueue` driver (provider `bullmq`) of `@appweaver/bullmq` uses [BullMQ](https://docs.bullmq.io/) on the Redis
connection of the `Memory` provider, and is selected when the package is installed (it brings `@appweaver/redis`, and
requires `MEMORY_PROVIDER` resolving to `redis`).
Otherwise the `MemoryQueue` of core (provider `memory`) runs the jobs in the process, losing them on a restart, which a
production application logs as a warning on startup.

A queue worker needs no server: disable `@appweaver/web` (`APP_MODULES_DISABLED=@appweaver/web`), and its workers keep
the application running. Set `HEALTH_CHECK_PORT` to answer the health checks of its container.

## Injecting Queue

```ts
import { inject } from '@appweaver/core';
import { Queue } from '@appweaver/common';

const queue = inject(Queue);
```

---

## `Queue` — manager

#### `queue.get<Data, Response>(name)`

Returns a `QueueProcessor` for the named queue. Creates the queue if it does not exist yet.

```ts
const emailQueue = queue.get<EmailJobData, void>('emails');
```

#### `queue.close(name)`

Closes a named queue and releases its resources. Returns `true` if closed.

```ts
await queue.close('emails');
```

#### `queue.closeAll()`

Closes all open queues.

```ts
await queue.closeAll();
```

#### `queue.checkHealth()`

Returns a `HealthCheckResult` indicating whether the underlying queue backend is reachable.

### Unavailable backend

`BullQueue` needs Redis and has no fallback. The application still starts while Redis is down, but `sendJob` and
`sendBulkJobs` throw a `QueueError` with the `QUEUE_UNAVAILABLE` code right away instead of waiting for
the reconnection, so callers that must not fail should catch it. Workers pick jobs up again once Redis reconnects.

---

## `QueueProcessor` — per-queue API

Obtained via `queue.get(name)`.

#### `processor.sendJob(data, name?, options?)`

Enqueues a single job. Returns the created `QueueJob`.

| Parameter | Type              | Description                  |
|-----------|-------------------|------------------------------|
| `data`    | `Data`            | Job payload                  |
| `name`    | `string`          | Optional job name/type label |
| `options` | `QueueJobOptions` | Job options, see below       |

**`QueueJobOptions`** (the same for every queue):

| Field             | Type                                                | Description                                               |
|-------------------|-----------------------------------------------------|-----------------------------------------------------------|
| `delay`           | `number`                                            | Milliseconds to wait before the job is processed          |
| `attempts`        | `number`                                            | Attempts, the first one included (`QUEUE_RETRY_ATTEMPTS`) |
| `backoff`         | `{ type: 'fixed' \| 'exponential'; delay: number }` | Wait between the attempts (`QUEUE_RETRY_BACKOFF*`)        |
| `priority`        | `number`                                            | A lower number is processed first                         |
| `jobId`           | `string`                                            | A custom job id                                           |
| `metadata`        | `Record<string, unknown>`                           | Free-form details, kept in the queue history only         |
| `providerOptions` | `Record<string, unknown>`                           | Options of the driver, i.e. the `JobsOptions` of BullMQ   |

```ts
const job = await emailQueue.sendJob({ to: 'alice@example.com', template: 'welcome' }, 'welcome', { delay: 60_000 });
```

#### `processor.sendBulkJobs(jobs)`

Enqueues multiple jobs in a single call. Returns an array of created `QueueJob` instances.

```ts
await emailQueue.sendBulkJobs([
  { data: { to: 'alice@example.com', template: 'welcome' } },
  { data: { to: 'bob@example.com', template: 'welcome' } }
]);
```

#### `processor.addWorker(processor, options?)`

Registers a worker function that processes jobs from the queue. Returns the created worker handle. The
`QueueWorkerOptions` take the `concurrency` (jobs processed at once) and the `providerOptions` of the driver.

```ts
emailQueue.addWorker(
  async (job) => {
    await sendEmail(job.data.to, job.data.template);
  },
  { concurrency: 5 }
);
```

#### `processor.removeWorker(id)`

Removes a registered worker by ID.

```ts
await emailQueue.removeWorker(workerId);
```

#### `processor.close()`

Closes this processor and its workers.

---

## Event listeners

Each listener registration method returns a listener ID. Pass it to `removeListener` to unsubscribe.

| Method                 | Trigger                                |
|------------------------|----------------------------------------|
| `onCompleted(handler)` | Job finished successfully              |
| `onFailed(handler)`    | Job failed (after all retries)         |
| `onError(handler)`     | Worker or queue error                  |
| `onProgress(handler)`  | Job reported progress                  |
| `onActive(handler)`    | Job moved from waiting to active       |
| `onStalled(handler)`   | Job stalled (worker did not heartbeat) |
| `onDrained(handler)`   | Queue became empty                     |
| `onReady(handler)`     | Queue is ready to process jobs         |
| `onPaused(handler)`    | Queue was paused                       |
| `onResumed(handler)`   | Queue was resumed                      |
| `onClosing(handler)`   | Queue is closing                       |
| `onClosed(handler)`    | Queue closed                           |

```ts
const listenerId = emailQueue.onCompleted((job, result) => {
  logger.info(`Email job ${job.id} completed`);
});

emailQueue.onFailed((job, err) => {
  logger.error(err, `Email job failed:`);
});

// Unsubscribe later
emailQueue.removeListener(listenerId);
```

---

## `QueueJob` shape

```ts
type QueueJob<Data, Response> = {
  id?: string;
  name: string;
  data: Data;
  returnvalue: Response;
};
```

`processor.jobInfo(job)` returns the attempt a worker processes (the first one is `1`) and the number of attempts of a
job, `{ attempt, maxAttempts }`, the same for every driver. A driver that does not override it returns `{}`.

---

## Queue history

With `queue.history.enabled` (`QUEUE_HISTORY_ENABLED=true`), every job of every queue is recorded in the database, in
the `_queue_jobs` table of the `QueueJobRecord` model of `@appweaver/data`: who sent it, on which queue, its payload,
each attempt with its error, the result and the timing, like the job table of River. The queue (BullMQ on Redis, or the
memory queue) stays the source of truth: the history is written beside it, never fails or delays a job (a failed write
is logged as a `Queue history write failed` warning of the `queue` logger), and is not transactional with the queue.
It is disabled by default, so the table exists only when enabled (or with `queue.history.keepDatabaseTable`). Enabling
it needs `weaver generate` and `weaver migration new add_queue_history`.

Core wraps the `Queue` of the selected driver (a decorator of its manifest), so every driver is recorded the same way,
and the `database` provider of `QueueHistory` (`@appweaver/data`) stores the records. A job sent without a `jobId`
gets a generated UUID, and every send gets a record of its own, with its own UUIDv7 `id`, so a custom `jobId` sent again
(a deduplication key, a re-run) adds a new record.

| State       | When                                                                     |
|-------------|--------------------------------------------------------------------------|
| `pending`   | Sent, waiting for a worker                                               |
| `scheduled` | Sent with a `delay`, `scheduledAt` is when it is due                     |
| `running`   | A worker processes an attempt                                            |
| `retrying`  | An attempt failed and the job has attempts left                          |
| `completed` | An attempt succeeded, its result is stored                               |
| `failed`    | The last attempt failed (or threw an `UnrecoverableError`), or the queue refused the job (attempt `0`) |
| `stalled`   | The worker stopped responding during an attempt (BullMQ), retried by BullMQ |

| Field                                      | Holds                                                                                  |
|--------------------------------------------|----------------------------------------------------------------------------------------|
| `id`                                       | The UUIDv7 of the record                                                               |
| `queue`, `jobId`, `name`, `driver`         | The queue, the id and name of the job, the provider (`bullmq`, `memory`)               |
| `state`, `attempt`, `maxAttempts`          | The state and the last attempt                                                         |
| `data`, `result`, `metadata`, `options`    | The payload, the result, the `metadata` option and the job options (`delay`, `attempts`, `backoff`, `priority`) |
| `errors`, `lastError`                      | Every failed attempt, `{ attempt, at, message, name, code, stack }`, and the last message |
| `enqueuedAt`, `scheduledAt`, `startedAt`, `finishedAt`, `durationMs` | The timing of the job and of its last attempt                |
| `enqueuedBy`, `attemptedBy`                | The processes (`<hostname>:<pid>`) sending the job and running its last attempt        |
| `userId`, `authType`, `authSource`, `apiKeyId` | The user sending the job, from the request or `runAs`                              |
| `parentId`                                 | The record of the job whose worker sent this one                                       |
| `callerSite`                               | The `file:line:column` of the `sendJob` call, with `queue.history.recordCallerSite`    |

A job sent outside of a transaction is recorded before it is sent, so no worker starts it first. One sent inside a
transaction is recorded once the transaction commits or rolls back (the job is sent either way), outside of it. A job
sent by another application without the history gets its record when a worker starts it. The records are resources,
read with `injectService('QueueJobRecord')` or the Prisma client (`db.queueJobRecord`):

```ts
const failed = await db.queueJobRecord.findMany({
  where: { queue: 'payments', state: 'failed' },
  orderBy: { createdAt: 'desc' }
});
```

The `QueueHistoryCleaner` of core deletes the completed and failed records older than `queue.history.retentionDays`
once the application is ready, then every `queue.history.cleanupIntervalSeconds`. Another store implements the
`QueueHistory` contract of `@appweaver/common`, selected with `queue.history.provider`.

---

## Configuration

| Key                          | Type     | Default   | Description                                                                                                  |
|------------------------------|----------|-----------|--------------------------------------------------------------------------------------------------------------|
| `QUEUE_PROVIDER`             | `string` | `'auto'`  | `auto` (`bullmq` with `@appweaver/bullmq`, otherwise `memory`), `memory`, `bullmq`, `none`, or a module path |
| `QUEUE_KEEP_COMPLETED_COUNT` | `int`    | `0`       | How many completed jobs to retain (0 = remove all)                                                           |
| `QUEUE_KEEP_FAILED_COUNT`    | `int`    | `50`      | How many failed jobs to retain for inspection                                                                |
| `QUEUE_RETRY_ATTEMPTS`       | `int`    | `3`       | Number of retry attempts on failure                                                                          |
| `QUEUE_RETRY_BACKOFF`        | `int`    | `3000`    | Backoff delay in milliseconds                                                                                |
| `QUEUE_RETRY_BACKOFF_TYPE`   | `enum`   | `'fixed'` | `fixed` or `exponential`                                                                                     |

The `QUEUE_HISTORY_*` keys of the queue history are listed in [configuration.md](configuration.md).

**Use `MemoryQueue` in the tests:**

```json
{
  "environments": {
    "test": {
      "queue": {
        "provider": "memory"
      }
    }
  }
}
```

---

## Real-world example

```ts
import { inject } from '@appweaver/core';
import { createLogger, Queue } from '@appweaver/common';

const logger = createLogger('reports');

type ReportJob = { userId: number; reportType: string };

export class ReportService {
  private readonly _processor = inject(Queue).get<ReportJob, void>('reports');

  constructor() {
    this._processor.addWorker(async (job) => {
      await generateReport(job.data.userId, job.data.reportType);
    });

    this._processor.onFailed((job, err) => {
      logger.error(err, `Report generation failed for user ${job?.data.userId}:`);
    });
  }

  async requestReport(userId: number, reportType: string): Promise<void> {
    await this._processor.sendJob({ userId, reportType });
  }
}
```
