import { SpanKind } from '@opentelemetry/api';
import {
  DURATION_BUCKETS,
  spanErrorType,
  extractTraceContext,
  injectTraceContext,
  recordDuration,
  telemetryCounter,
  telemetryEnabled,
  telemetryHistogram,
  TraceCarrier,
  withSpan
} from './telemetry';

/** The queue a job is sent to or processed from. */
export type QueueTelemetry = {
  /** The name of the queue driver, i.e. `bullmq`. */
  system: string;
  /** The name of the queue. */
  queue: string;
};

const sentJobs = telemetryCounter('messaging.client.sent.messages', {
  description: 'Number of jobs sent to the queues.',
  unit: '{message}'
});

const processDuration = telemetryHistogram('messaging.process.duration', {
  description: 'Duration of the queue jobs processed by the workers.',
  unit: 's',
  advice: { explicitBucketBoundaries: DURATION_BUCKETS }
});

/**
 * Sends jobs to a queue in a producer span, giving the send the trace context to store with the jobs, which
 * {@link traceQueueProcess} continues in the worker. A queue driver wraps its `sendJob` and `sendBulkJobs` with it.
 *
 * @example
 * return traceQueueSend({ system: 'sqs', queue: this.name }, name, (carrier) =>
 *   this.send({ data, name, traceContext: carrier })
 * );
 *
 * @param {QueueTelemetry} target - The driver and the queue.
 * @param {string | undefined} jobName - The name of the job, `undefined` for a bulk of jobs.
 * @param {Function} send - Sends the jobs, receiving the carrier to store, `undefined` without a trace.
 * @param {number} [count=1] - The number of jobs sent.
 * @return {Object} The value returned by the send.
 */
export function traceQueueSend<T>(
  target: QueueTelemetry,
  jobName: string | undefined,
  send: (carrier: TraceCarrier | undefined) => T,
  count = 1
): T {
  if (!telemetryEnabled('queue')) {
    return send(undefined);
  }
  const attributes = {
    'messaging.system': target.system,
    'messaging.destination.name': target.queue,
    'messaging.operation.name': 'send',
    'messaging.operation.type': 'send'
  };
  sentJobs().add(count, attributes);
  return withSpan(
    `send ${target.queue}`,
    {
      kind: SpanKind.PRODUCER,
      attributes: {
        ...attributes,
        ...(jobName ? { 'appweaver.queue.job.name': jobName } : {}),
        ...(count > 1 ? { 'messaging.batch.message_count': count } : {})
      }
    },
    () => send(injectTraceContext())
  );
}

/**
 * Processes a job in a consumer span, a child of the span that sent it when the job carries its trace context,
 * otherwise the root of a new trace. A queue driver wraps the processor of its workers with it, once per attempt.
 *
 * @param {QueueTelemetry} target - The driver and the queue.
 * @param {Object} job - The id, the name and the attempt of the job.
 * @param {TraceCarrier | undefined} carrier - The carrier stored with the job by {@link traceQueueSend}.
 * @param {Function} process - Processes the job.
 * @return {Promise<Object>} The value returned by the processor.
 */
export async function traceQueueProcess<T>(
  target: QueueTelemetry,
  job: { id?: string; name?: string; attempt?: number },
  carrier: TraceCarrier | undefined | null,
  process: () => T | Promise<T>
): Promise<T> {
  if (!telemetryEnabled('queue')) {
    return process();
  }
  const attributes = {
    'messaging.system': target.system,
    'messaging.destination.name': target.queue,
    'messaging.operation.name': 'process',
    'messaging.operation.type': 'process'
  };
  const start = performance.now();
  let failure: string | undefined;
  try {
    return await withSpan(
      `process ${target.queue}`,
      {
        kind: SpanKind.CONSUMER,
        parent: extractTraceContext(carrier),
        attributes: {
          ...attributes,
          ...(job.id ? { 'messaging.message.id': job.id } : {}),
          ...(job.name ? { 'appweaver.queue.job.name': job.name } : {}),
          ...(job.attempt ? { 'appweaver.queue.job.attempt': job.attempt } : {})
        }
      },
      async () => process()
    );
  } catch (error) {
    failure = spanErrorType(error);
    throw error;
  } finally {
    recordDuration(processDuration(), start, {
      ...attributes,
      ...(failure ? { 'error.type': failure } : {})
    });
  }
}
