import { metrics, trace } from '@opentelemetry/api';
import { recordTelemetry } from '../record-telemetry';

describe('recordTelemetry', () => {
  test('records the spans ended while it is registered', async () => {
    const telemetry = recordTelemetry();
    const tracer = trace.getTracer('test');

    tracer.startActiveSpan('import', (span) => {
      expect(trace.getActiveSpan()).toBe(span);
      span.end();
    });

    expect(telemetry.spans().map((span) => span.name)).toEqual(['import']);
    expect(telemetry.span('import').name).toBe('import');
    expect(() => telemetry.span('export')).toThrow(
      'No span named "export" was recorded, only: import'
    );

    telemetry.reset();
    expect(telemetry.spans()).toHaveLength(0);
    expect(() => telemetry.span('import')).toThrow('only: none');
    await telemetry.stop();
  });

  test('reads the metrics recorded so far', async () => {
    const telemetry = recordTelemetry();
    const counter = metrics.getMeter('test').createCounter('orders');

    counter.add(2);
    expect((await telemetry.metric('orders'))?.dataPoints[0].value).toBe(2);
    counter.add(1);
    expect((await telemetry.metrics()).map((m) => m.descriptor.name)).toEqual([
      'orders'
    ]);
    expect((await telemetry.metric('orders'))?.dataPoints[0].value).toBe(3);
    expect(await telemetry.metric('missing')).toBeUndefined();
    await telemetry.stop();
  });

  test('unregisters the SDK when stopped', async () => {
    const telemetry = recordTelemetry();
    await telemetry.stop();

    trace.getTracer('test').startSpan('late').end();

    expect(telemetry.spans()).toHaveLength(0);
    expect(trace.getTracer('test').startSpan('late').isRecording()).toBe(false);
  });
});
