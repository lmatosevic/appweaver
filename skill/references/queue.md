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
