import {
  Attributes,
  Context,
  context,
  Counter,
  Histogram,
  isSpanContextValid,
  Meter,
  MeterProvider,
  MetricOptions,
  metrics,
  propagation,
  ROOT_CONTEXT,
  Span,
  SpanOptions,
  SpanStatusCode,
  trace,
  Tracer,
  UpDownCounter
} from '@opentelemetry/api';
import {
  telemetryConfig,
  telemetryInstrumentationsConfig
} from './telemetry-config';

/** The name of the tracer and the meter of the framework, the instrumentation scope of its spans and metrics. */
export const TELEMETRY_SCOPE = 'appweaver';

/** A part of the framework with its own switch in the `telemetry.instrumentations` config. */
export type TelemetryInstrumentation =
  | 'http'
  | 'database'
  | 'queue'
  | 'scheduler'
  | 'mailer'
  | 'sms'
  | 'cache'
  | 'task';

/** The trace context of a span as text, i.e. its `traceparent`, carried in a queue job or the headers of a request. */
export type TraceCarrier = Record<string, string>;

/** The options of {@link withSpan}: the ones of a span, and the context of its parent. */
export type WithSpanOptions = SpanOptions & {
  /** The context holding the parent of the span. Default: the active context. */
  parent?: Context;
};

/**
 * Tells whether the framework records telemetry, as a whole or for one of its parts.
 *
 * @param {TelemetryInstrumentation} [instrumentation] - The part of the framework to check.
 * @return {boolean} `false` when `telemetry.enabled` or the switch of the part is off.
 */
export function telemetryEnabled(
  instrumentation?: TelemetryInstrumentation
): boolean {
  if (!telemetryConfig.ENABLED) {
    return false;
  }
  return instrumentation
    ? telemetryInstrumentationsConfig[
        instrumentation.toUpperCase() as keyof typeof telemetryInstrumentationsConfig
      ]
    : true;
}

/**
 * Returns the tracer of the framework, recording nothing until an OpenTelemetry SDK is registered.
 *
 * @return {Tracer} The tracer.
 */
export function telemetryTracer(): Tracer {
  return trace.getTracer(TELEMETRY_SCOPE);
}

/**
 * Returns the meter of the framework, recording nothing until an OpenTelemetry SDK is registered.
 *
 * @return {Meter} The meter.
 */
export function telemetryMeter(): Meter {
  return metrics.getMeter(TELEMETRY_SCOPE);
}

/**
 * Runs a function in a new span, the active span of everything the function calls. The span ends when the function
 * returns, or when the promise it returns settles, and an error it throws is recorded on the span and thrown again.
 *
 * @example
 * const invoice = await withSpan('invoice render', { attributes: { 'invoice.id': id } }, async (span) => {
 *   const pdf = await render(id);
 *   span.setAttribute('invoice.size', pdf.length);
 *   return pdf;
 * });
 *
 * @param {string} name - The name of the span, without values of a high cardinality such as ids.
 * @param {WithSpanOptions} options - The kind, attributes and links of the span, and its parent.
 * @param {Function} fn - The function to run, receiving the span.
 * @return {Object} The value returned by the function.
 */
export function withSpan<T>(
  name: string,
  options: WithSpanOptions,
  fn: (span: Span) => T
): T {
  const { parent, ...spanOptions } = options;
  return telemetryTracer().startActiveSpan(
    name,
    spanOptions,
    parent ?? context.active(),
    (span) => {
      let result: T;
      try {
        result = fn(span);
      } catch (error) {
        failSpan(span, error);
        span.end();
        throw error;
      }
      if (!isThenable(result)) {
        span.end();
        return result;
      }
      return result.then(
        (value) => {
          span.end();
          return value;
        },
        (error) => {
          failSpan(span, error);
          span.end();
          throw error;
        }
      ) as T;
    }
  );
}

/**
 * Starts a span without running anything in it, for a caller ending it itself, i.e. the span of an HTTP request
 * started and ended in two hooks. The returned context makes the span the parent of what runs in it with
 * {@link runInTraceContext}.
 *
 * @param {string} name - The name of the span.
 * @param {WithSpanOptions} [options={}] - The kind, attributes and links of the span, and its parent.
 * @return {Object} The span, to end with `span.end()`, and the context holding it.
 */
export function startSpan(
  name: string,
  options: WithSpanOptions = {}
): { span: Span; context: Context } {
  const { parent, ...spanOptions } = options;
  const parentContext = parent ?? context.active();
  const span = telemetryTracer().startSpan(name, spanOptions, parentContext);
  return { span, context: trace.setSpan(parentContext, span) };
}

/**
 * Runs a function in a trace context, i.e. the one of {@link startSpan} or {@link extractTraceContext}, so the spans
 * started in the function are the children of its span.
 *
 * @param {Context} traceContext - The context to run the function in.
 * @param {Function} fn - The function to run.
 * @return {Object} The value returned by the function.
 */
export function runInTraceContext<T>(traceContext: Context, fn: () => T): T {
  return context.with(traceContext, fn);
}

/**
 * Records an error on a span: the exception, the error status and the `error.type` attribute, the code of an
 * `AppweaverError` or the name of any other error.
 *
 * @param {Span} span - The span the error ends.
 * @param {unknown} error - The error.
 */
export function failSpan(span: Span, error: unknown): void {
  span.recordException(error instanceof Error ? error : String(error));
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: (error as Error | null)?.message
  });
  span.setAttribute('error.type', spanErrorType(error));
}

/**
 * Returns the `error.type` attribute of an error: the code of an `AppweaverError`, otherwise the name of the error.
 *
 * @param {unknown} error - The error.
 * @return {string} The type of the error.
 */
export function spanErrorType(error: unknown): string {
  const e = error as { code?: unknown; name?: string } | null;
  return typeof e?.code === 'string' ? e.code : (e?.name ?? 'Error');
}

/**
 * Returns the active span, i.e. to add attributes to the span of the current request or job.
 *
 * @return {Span | undefined} The active span, or `undefined` outside of a span.
 */
export function currentSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Returns the id of the trace of the active span, the same in every service the trace passes.
 *
 * @return {string | undefined} The trace id, or `undefined` outside of a recorded trace.
 */
export function currentTraceId(): string | undefined {
  return spanTraceId(trace.getActiveSpan());
}

/**
 * Returns the id of the trace of a span.
 *
 * @param {Span} [span] - The span.
 * @return {string | undefined} The trace id, or `undefined` without a span or for a span of no trace.
 */
export function spanTraceId(span?: Span): string | undefined {
  const spanContext = span?.spanContext();
  return spanContext && isSpanContextValid(spanContext)
    ? spanContext.traceId
    : undefined;
}

/**
 * Returns the fields correlating a log record with the active span, named as the OpenTelemetry log bridges name
 * them.
 *
 * @return {Object | undefined} The `trace_id`, `span_id` and `trace_flags` of the active span, or `undefined` outside
 * of a recorded trace.
 */
export function traceLogFields():
  | { trace_id: string; span_id: string; trace_flags: string }
  | undefined {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (!spanContext || !isSpanContextValid(spanContext)) {
    return undefined;
  }
  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
    trace_flags: `0${spanContext.traceFlags.toString(16)}`
  };
}

/**
 * Writes the active trace context into a carrier, i.e. the `traceparent` of the active span, to continue the trace
 * where the carrier is read with {@link extractTraceContext}.
 *
 * @param {TraceCarrier} [carrier={}] - The carrier to write into.
 * @return {TraceCarrier | undefined} The carrier, or `undefined` when there is no trace to carry.
 */
export function injectTraceContext(
  carrier: TraceCarrier = {}
): TraceCarrier | undefined {
  propagation.inject(context.active(), carrier);
  return Object.keys(carrier).length > 0 ? carrier : undefined;
}

/**
 * Reads the trace context of a carrier written with {@link injectTraceContext}, or of the headers of a request.
 *
 * @param {Object} [carrier] - The carrier or the headers.
 * @return {Context} The context to start a span in, the root context without a carrier.
 */
export function extractTraceContext(carrier?: object | null): Context {
  return carrier ? propagation.extract(ROOT_CONTEXT, carrier) : ROOT_CONTEXT;
}

/**
 * Declares a counter of the framework meter, created on its first use and again once an SDK is registered.
 *
 * @param {string} name - The name of the metric.
 * @param {MetricOptions} [options] - Its description and unit.
 * @return {Function} Returns the counter.
 */
export function telemetryCounter(
  name: string,
  options?: MetricOptions
): () => Counter {
  return lazyInstrument((meter) => meter.createCounter(name, options));
}

/**
 * Declares an up-down counter of the framework meter, created on its first use and again once an SDK is registered.
 *
 * @param {string} name - The name of the metric.
 * @param {MetricOptions} [options] - Its description and unit.
 * @return {Function} Returns the counter.
 */
export function telemetryUpDownCounter(
  name: string,
  options?: MetricOptions
): () => UpDownCounter {
  return lazyInstrument((meter) => meter.createUpDownCounter(name, options));
}

/**
 * Declares a histogram of the framework meter, created on its first use and again once an SDK is registered.
 *
 * @param {string} name - The name of the metric.
 * @param {MetricOptions} [options] - Its description and unit.
 * @return {Function} Returns the histogram.
 */
export function telemetryHistogram(
  name: string,
  options?: MetricOptions
): () => Histogram {
  return lazyInstrument((meter) => meter.createHistogram(name, options));
}

/** The buckets of a duration in seconds, as the OpenTelemetry semantic conventions advise. */
export const DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10
];

/**
 * Records the seconds passed since a start into a duration histogram.
 *
 * @param {Histogram} histogram - The histogram, in seconds.
 * @param {number} start - The start, a `performance.now()` value.
 * @param {Attributes} [attributes] - The attributes of the measurement.
 */
export function recordDuration(
  histogram: Histogram,
  start: number,
  attributes?: Attributes
): void {
  histogram.record((performance.now() - start) / 1000, attributes);
}

// The metrics API has no proxy, so an instrument created before the SDK is
// registered would never record
function lazyInstrument<T>(create: (meter: Meter) => T): () => T {
  let provider: MeterProvider | undefined;
  let instrument: T;
  return () => {
    const current = metrics.getMeterProvider();
    if (current !== provider) {
      provider = current;
      instrument = create(current.getMeter(TELEMETRY_SCOPE));
    }
    return instrument;
  };
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as PromiseLike<unknown> | null)?.then === 'function';
}
