import { recordTelemetry, TelemetryRecorder } from '@appweaver/testing';
import { configOverrides } from '../../config';
import {
  SpanKind,
  SpanStatusCode,
  TraceCarrier,
  traceQueueProcess,
  traceQueueSend
} from '../../telemetry';

describe('queue-telemetry', () => {
  const target = { system: 'memory', queue: 'orders' };
  let telemetry: TelemetryRecorder | undefined;

  afterEach(async () => {
    await telemetry?.stop();
    telemetry = undefined;
    delete configOverrides.TELEMETRY_INSTRUMENTATIONS_QUEUE;
  });

  test('continues the trace of the sender in the worker', async () => {
    telemetry = recordTelemetry();
    let carrier: TraceCarrier | undefined;

    const sent = traceQueueSend(target, 'charge', (value) => {
      carrier = value;
      return 'job-1';
    });
    const result = await traceQueueProcess(
      target,
      { id: 'job-1', name: 'charge', attempt: 2 },
      carrier,
      async () => 'charged'
    );

    expect(sent).toBe('job-1');
    expect(result).toBe('charged');
    const send = telemetry.span('send orders');
    const process = telemetry.span('process orders');
    expect(send.kind).toBe(SpanKind.PRODUCER);
    expect(send.attributes).toEqual({
      'messaging.system': 'memory',
      'messaging.destination.name': 'orders',
      'messaging.operation.name': 'send',
      'messaging.operation.type': 'send',
      'appweaver.queue.job.name': 'charge'
    });
    expect(process.kind).toBe(SpanKind.CONSUMER);
    expect(process.spanContext().traceId).toBe(send.spanContext().traceId);
    expect(process.parentSpanContext?.spanId).toBe(send.spanContext().spanId);
    expect(process.attributes).toMatchObject({
      'messaging.message.id': 'job-1',
      'appweaver.queue.job.name': 'charge',
      'appweaver.queue.job.attempt': 2
    });
  });

  test('counts the jobs of a bulk in one span', async () => {
    telemetry = recordTelemetry();

    traceQueueSend(target, undefined, () => undefined, 3);

    expect(telemetry.span('send orders').attributes).toMatchObject({
      'messaging.batch.message_count': 3
    });
    expect(
      (await telemetry.metric('messaging.client.sent.messages'))?.dataPoints[0]
        .value
    ).toBe(3);
  });

  test('starts a new trace for a job without a carrier', async () => {
    telemetry = recordTelemetry();

    await traceQueueProcess(target, {}, undefined, () => 1);

    expect(telemetry.span('process orders').parentSpanContext).toBeUndefined();
    const duration = await telemetry.metric('messaging.process.duration');
    expect(duration?.dataPoints[0].attributes).not.toHaveProperty('error.type');
  });

  test('records a failed job with its error type', async () => {
    telemetry = recordTelemetry();

    await expect(
      traceQueueProcess(target, { id: 'job-2' }, undefined, () => {
        throw new RangeError('declined');
      })
    ).rejects.toThrow('declined');

    expect(telemetry.span('process orders').status.code).toBe(
      SpanStatusCode.ERROR
    );
    const duration = await telemetry.metric('messaging.process.duration');
    expect(duration?.dataPoints[0].attributes['error.type']).toBe('RangeError');
  });

  test('neither traces nor carries a context with the instrumentation off', async () => {
    telemetry = recordTelemetry();
    configOverrides.TELEMETRY_INSTRUMENTATIONS_QUEUE = false;
    const send = jest.fn(() => 'sent');

    expect(traceQueueSend(target, 'charge', send)).toBe('sent');
    await expect(
      traceQueueProcess(target, {}, undefined, () => 'done')
    ).resolves.toBe('done');

    expect(send).toHaveBeenCalledWith(undefined);
    expect(telemetry.spans()).toHaveLength(0);
  });

  test('sends without a carrier when no SDK records the trace', () => {
    const send = jest.fn();

    traceQueueSend(target, 'charge', send);

    expect(send).toHaveBeenCalledWith(undefined);
  });
});
