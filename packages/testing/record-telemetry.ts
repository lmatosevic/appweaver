import { context, metrics, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  MetricData,
  PeriodicExportingMetricReader
} from '@opentelemetry/sdk-metrics';
import {
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
  TracerProvider
} from '@opentelemetry/sdk-trace';

/** The telemetry recorded in a test. */
export type TelemetryRecorder = {
  /** The ended spans, in the order they ended. */
  spans(): ReadableSpan[];
  /** The ended span of a name, failing the lookup with the names of the recorded spans. */
  span(name: string): ReadableSpan;
  /** The metrics recorded so far. */
  metrics(): Promise<MetricData[]>;
  /** The metric of a name, `undefined` when nothing was recorded into it. */
  metric(name: string): Promise<MetricData | undefined>;
  /** Forgets the recorded spans. */
  reset(): void;
  /** Stops recording and unregisters the SDK, to call after each test. */
  stop(): Promise<void>;
};

/**
 * Registers an in-memory OpenTelemetry SDK, so a test reads the spans and the metrics the framework and the
 * application record: the spans of `withSpan`, of the HTTP requests, the database operations and the queue jobs.
 * Call it before the code under test runs, and `stop()` after the test.
 *
 * @example
 * let telemetry: TelemetryRecorder;
 * beforeEach(() => (telemetry = recordTelemetry()));
 * afterEach(() => telemetry.stop());
 *
 * test('traces the import', async () => {
 *   await importOrders();
 *   expect(telemetry.span('orders import').attributes).toMatchObject({ 'orders.count': 3 });
 * });
 *
 * @return {TelemetryRecorder} The recorder of the spans and the metrics.
 */
export function recordTelemetry(): TelemetryRecorder {
  const spanExporter = new InMemorySpanExporter();
  const tracerProvider = new TracerProvider({
    spanProcessors: [new SimpleSpanProcessor({ exporter: spanExporter })]
  });
  const metricExporter = new InMemoryMetricExporter(
    AggregationTemporality.CUMULATIVE
  );
  const meterProvider = new MeterProvider({
    readers: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        // Collected only when the metrics are read
        exportIntervalMillis: 2 ** 31 - 1,
        exportTimeoutMillis: 30_000
      })
    ]
  });

  trace.setGlobalTracerProvider(tracerProvider);
  context.setGlobalContextManager(
    new AsyncLocalStorageContextManager().enable()
  );
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  metrics.setGlobalMeterProvider(meterProvider);

  const collect = async () => {
    metricExporter.reset();
    await meterProvider.forceFlush();
    return metricExporter
      .getMetrics()
      .flatMap((resource) => resource.scopeMetrics)
      .flatMap((scope) => scope.metrics);
  };

  return {
    spans: () => spanExporter.getFinishedSpans(),
    span: (name) => {
      const spans = spanExporter.getFinishedSpans();
      const found = spans.find((span) => span.name === name);
      if (!found) {
        throw new Error(
          `No span named "${name}" was recorded, only: ${spans.map((span) => span.name).join(', ') || 'none'}`
        );
      }
      return found;
    },
    metrics: collect,
    metric: async (name) =>
      (await collect()).find((metric) => metric.descriptor.name === name),
    reset: () => spanExporter.reset(),
    stop: async () => {
      trace.disable();
      context.disable();
      propagation.disable();
      metrics.disable();
      await Promise.allSettled([
        tracerProvider.shutdown(),
        meterProvider.shutdown()
      ]);
    }
  };
}
