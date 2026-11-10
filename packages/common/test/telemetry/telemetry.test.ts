import { recordTelemetry, TelemetryRecorder } from '@appweaver/testing';
import { configOverrides } from '../../config';
import { ErrorCode, ResourceError } from '../../errors';
import {
  currentSpan,
  currentTraceId,
  extractTraceContext,
  failSpan,
  injectTraceContext,
  recordDuration,
  runInTraceContext,
  SpanKind,
  SpanStatusCode,
  spanErrorType,
  spanTraceId,
  startSpan,
  telemetryCounter,
  telemetryEnabled,
  telemetryHistogram,
  telemetryMeter,
  telemetryTracer,
  telemetryUpDownCounter,
  traceLogFields,
  withSpan
} from '../../telemetry';

describe('telemetry', () => {
  let telemetry: TelemetryRecorder | undefined;

  afterEach(async () => {
    await telemetry?.stop();
    telemetry = undefined;
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  describe('telemetryEnabled', () => {
    test('is on for the framework and its parts by default', () => {
      expect(telemetryEnabled()).toBe(true);
      expect(telemetryEnabled('http')).toBe(true);
    });

    test('turns a part off with its switch', () => {
      configOverrides.TELEMETRY_INSTRUMENTATIONS_QUEUE = false;

      expect(telemetryEnabled('queue')).toBe(false);
      expect(telemetryEnabled('database')).toBe(true);
    });

    test('turns every part off with telemetry disabled', () => {
      configOverrides.TELEMETRY_ENABLED = false;

      expect(telemetryEnabled()).toBe(false);
      expect(telemetryEnabled('http')).toBe(false);
    });
  });

  describe('withSpan', () => {
    test('runs the function without an SDK, recording nothing', async () => {
      expect(withSpan('idle', {}, () => 1)).toBe(1);
      await expect(withSpan('idle', {}, async () => 2)).resolves.toBe(2);
      expect(currentTraceId()).toBeUndefined();
      expect(traceLogFields()).toBeUndefined();
      expect(injectTraceContext()).toBeUndefined();
    });

    test('records a span around a synchronous function', () => {
      telemetry = recordTelemetry();

      const result = withSpan(
        'render',
        { kind: SpanKind.CLIENT, attributes: { 'invoice.id': 7 } },
        (span) => {
          expect(currentSpan()).toBe(span);
          return 'done';
        }
      );

      expect(result).toBe('done');
      const span = telemetry.span('render');
      expect(span.kind).toBe(SpanKind.CLIENT);
      expect(span.attributes).toEqual({ 'invoice.id': 7 });
      expect(span.status.code).toBe(SpanStatusCode.UNSET);
      expect(currentSpan()).toBeUndefined();
    });

    test('ends the span once the promise of the function resolves', async () => {
      telemetry = recordTelemetry();
      let release = () => {};

      const pending = withSpan('wait', {}, async () => {
        await new Promise<void>((resolve) => (release = resolve));
        return 5;
      });
      await Promise.resolve();
      expect(telemetry.spans()).toHaveLength(0);

      release();
      await expect(pending).resolves.toBe(5);
      expect(telemetry.spans()).toHaveLength(1);
    });

    test('makes the span the parent of the spans started in it', async () => {
      telemetry = recordTelemetry();

      await withSpan('parent', {}, async () => {
        await Promise.resolve();
        withSpan('child', {}, () => undefined);
      });

      const parent = telemetry.span('parent');
      const child = telemetry.span('child');
      expect(child.spanContext().traceId).toBe(parent.spanContext().traceId);
      expect(child.parentSpanContext?.spanId).toBe(parent.spanContext().spanId);
    });

    test('records the error a function throws and throws it again', () => {
      telemetry = recordTelemetry();
      const error = new ResourceError(
        ErrorCode.ResourceNotFound,
        'Post not found',
        { model: 'Post', id: 1 }
      );

      expect(() =>
        withSpan('find', {}, () => {
          throw error;
        })
      ).toThrow(error);

      const span = telemetry.span('find');
      expect(span.status).toEqual({
        code: SpanStatusCode.ERROR,
        message: 'Post not found'
      });
      expect(span.attributes['error.type']).toBe(ErrorCode.ResourceNotFound);
      expect(span.events[0].name).toBe('exception');
    });

    test('records the error a promise rejects with', async () => {
      telemetry = recordTelemetry();

      await expect(
        withSpan('fetch', {}, async () => {
          throw new TypeError('offline');
        })
      ).rejects.toThrow('offline');

      expect(telemetry.span('fetch').attributes['error.type']).toBe(
        'TypeError'
      );
    });

    test('starts the span in the given parent context', () => {
      telemetry = recordTelemetry();
      const { span: root, context } = startSpan('root');

      withSpan('detached', { parent: context }, () => undefined);
      root.end();

      expect(telemetry.span('detached').parentSpanContext?.spanId).toBe(
        root.spanContext().spanId
      );
    });
  });

  describe('failSpan', () => {
    test('records a value that is not an error', () => {
      telemetry = recordTelemetry();
      const { span } = startSpan('odd');

      failSpan(span, 'broken');
      span.end();

      expect(telemetry.span('odd').attributes['error.type']).toBe('Error');
      expect(spanErrorType(null)).toBe('Error');
      expect(spanErrorType({ name: 'Custom' })).toBe('Custom');
    });
  });

  describe('startSpan', () => {
    test('starts a span the caller ends, without activating it', () => {
      telemetry = recordTelemetry();

      const { span, context } = startSpan('request', { kind: SpanKind.SERVER });
      expect(currentSpan()).toBeUndefined();
      expect(runInTraceContext(context, () => currentSpan())).toBe(span);
      expect(runInTraceContext(context, () => currentTraceId())).toBe(
        span.spanContext().traceId
      );
      expect(telemetry.spans()).toHaveLength(0);

      span.end();
      expect(telemetry.span('request').kind).toBe(SpanKind.SERVER);
    });
  });

  describe('trace context', () => {
    test('carries the active span to where the carrier is read', () => {
      telemetry = recordTelemetry();

      const carrier = withSpan('send', {}, () => injectTraceContext());
      expect(carrier?.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);

      withSpan(
        'receive',
        { parent: extractTraceContext(carrier) },
        () => undefined
      );

      const send = telemetry.span('send');
      const receive = telemetry.span('receive');
      expect(receive.spanContext().traceId).toBe(send.spanContext().traceId);
      expect(receive.parentSpanContext?.spanId).toBe(send.spanContext().spanId);
    });

    test('starts a new trace without a carrier', () => {
      telemetry = recordTelemetry();

      withSpan('alone', { parent: extractTraceContext(null) }, () => undefined);

      expect(telemetry.span('alone').parentSpanContext).toBeUndefined();
    });

    test('returns the fields correlating a log record with the active span', () => {
      telemetry = recordTelemetry();

      withSpan('logged', {}, (span) => {
        const { traceId, spanId } = span.spanContext();
        expect(traceLogFields()).toEqual({
          trace_id: traceId,
          span_id: spanId,
          trace_flags: '01'
        });
        expect(spanTraceId(span)).toBe(traceId);
      });
      expect(spanTraceId()).toBeUndefined();
    });
  });

  describe('metrics', () => {
    test('records into the instruments once an SDK is registered', async () => {
      const requests = telemetryCounter('test.requests');
      const active = telemetryUpDownCounter('test.active');
      const duration = telemetryHistogram('test.duration', { unit: 's' });
      // Created before the SDK, when it records nothing
      requests().add(1);

      telemetry = recordTelemetry();
      requests().add(2, { result: 'hit' });
      active().add(1);
      active().add(-1);
      recordDuration(duration(), performance.now() - 250, { ok: true });

      expect((await telemetry.metric('test.requests'))?.dataPoints).toEqual([
        expect.objectContaining({ value: 2, attributes: { result: 'hit' } })
      ]);
      expect((await telemetry.metric('test.active'))?.dataPoints[0].value).toBe(
        0
      );
      const [point] = (await telemetry.metric('test.duration'))!.dataPoints;
      expect((point.value as { sum: number }).sum).toBeGreaterThanOrEqual(0.25);
      expect(point.attributes).toEqual({ ok: true });
    });

    test('exposes the tracer and the meter of the framework', () => {
      expect(telemetryTracer().startSpan('x').isRecording()).toBe(false);
      expect(telemetryMeter().createCounter('x')).toBeDefined();
    });
  });
});
