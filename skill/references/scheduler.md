# Scheduler

The scheduler module runs recurring tasks using cron expressions. The default implementation (`CronScheduler`) wraps
the [`cron`](https://github.com/kelektiv/node-cron) library. Jobs auto-start on `addJob` (controlled by
`SCHEDULER_AUTO_START_JOB`) and are stopped gracefully on application shutdown.

## Injecting Scheduler

```ts
import { inject } from '@appweaver/core';
import { Scheduler } from '@appweaver/common';

const scheduler = inject(Scheduler);
```

---

#### `scheduler.addJob(jobParams)`

Registers a new cron job and returns a unique job ID. Jobs start immediately by default (see
`SCHEDULER_AUTO_START_JOB`).

**`CronJobParams` fields** (from the `cron` library):

| Field               | Type                          | Default        | Description                                      |
|---------------------|-------------------------------|----------------|--------------------------------------------------|
| `cronTime`          | `string \| Date`              | —              | Cron expression or exact `Date`                  |
| `onTick`            | `() => void \| Promise<void>` | —              | Function to execute on each tick                 |
| `start`             | `boolean`                     | config default | Override `SCHEDULER_AUTO_START_JOB` for this job |
| `waitForCompletion` | `boolean`                     | `true`         | Wait for the current tick to finish before next  |
| `errorHandler`      | `(e: unknown) => void`        | logs error     | Custom error handler for tick failures           |
| `timeZone`          | `string`                      | system TZ      | IANA timezone (e.g. `'America/New_York'`)        |
| `runOnInit`         | `boolean`                     | `false`        | Execute immediately when the job is registered   |

```ts
const jobId = scheduler.addJob({
  cronTime: '0 9 * * *', // every day at 9 AM
  onTick: async () => {
    await sendDailyDigest();
  }
});
```

**Cron expression cheat sheet:**

```
┌──────────── minute (0–59)
│ ┌────────── hour (0–23)
│ │ ┌──────── day of month (1–31)
│ │ │ ┌────── month (1–12)
│ │ │ │ ┌──── day of week (0–7, 0 and 7 = Sunday)
│ │ │ │ │
* * * * *
```

| Expression     | Meaning                  |
|----------------|--------------------------|
| `* * * * *`    | Every minute             |
| `*/15 * * * *` | Every 15 minutes         |
| `0 * * * *`    | Every hour (on the hour) |
| `0 9 * * *`    | Every day at 9:00 AM     |
| `0 9 * * 1-5`  | Weekdays at 9:00 AM      |
| `0 0 1 * *`    | First day of every month |

---

#### `scheduler.getJob(jobId)`

Returns the underlying `CronJob` instance, or `undefined` if not found.

```ts
const job = scheduler.getJob(jobId);
logger.info(`Is running: ${job?.isActive}`);
```

---

#### `scheduler.startJob(jobId)`

Starts a stopped job. Returns `true` if started, `false` if the job does not exist.

```ts
scheduler.startJob(jobId);
```

---

#### `scheduler.stopJob(jobId)`

Stops a running job without removing it. Returns `true` if stopped.

```ts
await scheduler.stopJob(jobId);
```

---

#### `scheduler.startAll()`

Starts all registered jobs that are not yet active.

```ts
scheduler.startAll();
```

---

#### `scheduler.stopAll()`

Stops all running jobs. Called automatically during application shutdown.

```ts
await scheduler.stopAll();
```

---

#### `scheduler.removeJob(jobId)`

Stops and permanently removes a job. Returns `true` if removed.

```ts
await scheduler.removeJob(jobId);
```

---

## Configuration

| Key                        | Type     | Default                                      | Description                                      |
|----------------------------|----------|----------------------------------------------|--------------------------------------------------|
| `SCHEDULER_AUTO_START_JOB` | `bool`   | `true`                                       | Automatically start jobs when `addJob` is called |
| `SCHEDULER_PROVIDER`       | `string` | `'@appweaver/core/scheduler/cron-scheduler'` | Path to the Scheduler implementation             |

---

## Real-world example

Register all jobs at startup in a dedicated module:

```ts
// src/jobs/index.ts
import { inject } from '@appweaver/core';
import { Scheduler } from '@appweaver/common';

export function registerJobs() {
  const scheduler = inject(Scheduler);

  // Send a daily digest every morning at 8 AM
  scheduler.addJob({
    cronTime: '0 8 * * *',
    onTick: async () => {
      await sendDailyDigest();
    }
  });

  // Clean up expired sessions every 30 minutes
  scheduler.addJob({
    cronTime: '*/30 * * * *',
    onTick: async () => {
      await deleteExpiredSessions();
    }
  });

  // Run a heavy report only on weekdays; don't auto-start, trigger manually
  const reportJobId = scheduler.addJob({
    cronTime: '0 2 * * 1-5',
    start: false,
    onTick: async () => {
      await generateWeeklyReport();
    }
  });

  return { reportJobId };
}
```

```ts
// src/main.ts
const { reportJobId } = registerJobs();

// Start the report job manually when needed
scheduler.startJob(reportJobId);
```
