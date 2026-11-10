import { context, metrics, propagation, trace } from '@opentelemetry/api';
import {
  InMemoryLogRecordExporter,
  SimpleLogRecordProcessor
} from '@opentelemetry/sdk-logs';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader
} from '@opentelemetry/sdk-metrics';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor
} from '@opentelemetry/sdk-trace';
import {
  configOverrides,
  createLogger,
  telemetryCounter,
  withSpan
} from '@appweaver/common';
import { configureTelemetry } from '../configure-telemetry';
import { startTelemetry, TelemetrySdk } from '../sdk';

describe('startTelemetry', () => {
  // Created for every test, since an exporter stops with its SDK
  let spans: InMemorySpanExporter;
  let records: InMemoryLogRecordExporter;
  let metricExporter: InMemoryMetricExporter;
  let sdk: TelemetrySdk | undefined;
  let remove: () => void;

  beforeEach(() => {
    spans = new InMemorySpanExporter();
    records = new InMemoryLogRecordExporter();
    metricExporter = new InMemoryMetricExporter(
      AggregationTemporality.CUMULATIVE
    );
    remove = configureTelemetry((options) => {
      options.spanProcessors.push(new SimpleSpanProcessor({ exporter: spans }));
      options.logRecordProcessors.push(
        new SimpleLogRecordProcessor({ exporter: records })
      );
      options.metricReaders.push(
        new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: 60_000
        })
      );
      options.resourceAttributes['service.namespace'] = 'shop';
    });
  });

  afterEach(async () => {
    remove();
    await sdk?.shutdown();
    sdk = undefined;
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  test('records the spans of the framework tracer', async () => {
    sdk = await startTelemetry();

    await withSpan('parent', {}, async () => {
      withSpan('child', {}, () => undefined);
    });

    const [child, parent] = spans.getFinishedSpans();
    expect(child.name).toBe('child');
    expect(child.parentSpanContext?.spanId).toBe(parent.spanContext().spanId);
    expect(parent.resource.attributes['service.namespace']).toBe('shop');
  });

  test('describes the service from the application and the config', async () => {
    configOverrides.APP_NAME = 'Shop API';
    configOverrides.TELEMETRY_SERVICE_VERSION = '9.9.9';
    configOverrides.TELEMETRY_RESOURCE_ATTRIBUTES = ['team=core', 'invalid'];

    sdk = await startTelemetry();

    expect(sdk!.resource.attributes).toMatchObject({
      'service.name': 'Shop API',
      'service.version': '9.9.9',
      team: 'core'
    });
  });

  test('exports the log records with the trace of their span', async () => {
    configOverrides.TELEMETRY_LOGS_ENABLED = true;
    sdk = await startTelemetry();
    const log = createLogger('telemetryTest');
    const level = log.level;
    log.level = 'info';

    let traceId = '';
    withSpan('logging', {}, (span) => {
      traceId = span.spanContext().traceId;
      log.info({ order: { id: 7 }, err: new Error('boom') }, 'Order failed');
    });
    log.level = level;

    const record = records
      .getFinishedLogRecords()
      .find((entry) => entry.body === 'Order failed')!;
    expect(record.severityText).toBe('INFO');
    expect(record.spanContext?.traceId).toBe(traceId);
    expect(record.attributes).toMatchObject({
      'appweaver.logger': 'telemetryTest',
      'order.id': 7,
      'exception.message': 'boom'
    });
    expect(record.attributes.trace_id).toBeUndefined();
  });

  test('records the metrics of the framework meter', async () => {
    const counter = telemetryCounter('test.requests');
    counter().add(1);
    sdk = await startTelemetry();

    counter().add(2);
    await sdk!.forceFlush();

    const metric = metricExporter
      .getMetrics()
      .flatMap((resource) => resource.scopeMetrics)
      .flatMap((scope) => scope.metrics)
      .find((entry) => entry.descriptor.name === 'test.requests')!;
    expect(metric.dataPoints[0].value).toBe(2);
  });

  test('unregisters the SDK on shutdown', async () => {
    sdk = await startTelemetry();
    const provider = metrics.getMeterProvider();

    await sdk!.shutdown();
    sdk = undefined;

    withSpan('after', {}, () => undefined);
    expect(spans.getFinishedSpans()).toHaveLength(0);
    expect(metrics.getMeterProvider()).not.toBe(provider);
    expect(trace.getActiveSpan()).toBeUndefined();
    expect(propagation.fields()).toEqual([]);
    expect(context.active()).toBeDefined();
  });

  test('leaves an SDK that is already registered in place', async () => {
    sdk = await startTelemetry();

    await expect(startTelemetry()).resolves.toBeUndefined();
    withSpan('still recorded', {}, () => undefined);
    expect(spans.getFinishedSpans()).toHaveLength(1);
  });

  test('records no traces with the traces disabled', async () => {
    configOverrides.TELEMETRY_TRACES_ENABLED = false;
    configOverrides.TELEMETRY_METRICS_ENABLED = false;
    sdk = await startTelemetry();

    withSpan('ignored', {}, () => undefined);

    expect(sdk!.tracerProvider).toBeUndefined();
    expect(sdk!.meterProvider).toBeUndefined();
    expect(spans.getFinishedSpans()).toHaveLength(0);
  });
});
