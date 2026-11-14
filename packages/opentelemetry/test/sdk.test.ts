// The OTLP exporters record the options they are created with
function mockOtlpExporter(signal: string) {
  return jest.fn((options: object) => ({
    signal,
    options,
    export: jest.fn((_items: unknown, done: (result: object) => void) =>
      done({ code: 0 })
    ),
    forceFlush: jest.fn(async () => undefined),
    shutdown: jest.fn(async () => undefined),
    selectAggregationTemporality: () => 1,
    selectAggregation: () => ({ type: 0 })
  }));
}
jest.mock('@opentelemetry/exporter-trace-otlp-proto', () => ({
  OTLPTraceExporter: mockOtlpExporter('traces:proto')
}));
jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: mockOtlpExporter('traces:json')
}));
jest.mock('@opentelemetry/exporter-metrics-otlp-proto', () => ({
  OTLPMetricExporter: mockOtlpExporter('metrics:proto')
}));
jest.mock('@opentelemetry/exporter-metrics-otlp-http', () => ({
  OTLPMetricExporter: mockOtlpExporter('metrics:json')
}));
jest.mock('@opentelemetry/exporter-logs-otlp-proto', () => ({
  OTLPLogExporter: mockOtlpExporter('logs:proto')
}));
jest.mock('@opentelemetry/exporter-logs-otlp-http', () => ({
  OTLPLogExporter: mockOtlpExporter('logs:json')
}));

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
import { OTLPLogExporter as JsonLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter as JsonTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { configureTelemetry, TelemetryOptions } from '../configure-telemetry';
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

describe('startTelemetry exporters', () => {
  let sdk: TelemetrySdk | undefined;
  let options: TelemetryOptions;
  let remove: () => void;

  const created = (exporter: unknown) =>
    (exporter as jest.Mock).mock.calls.map(([value]) => value);

  beforeEach(() => {
    jest.clearAllMocks();
    remove = configureTelemetry((value) => (options = value));
  });

  afterEach(async () => {
    remove();
    await sdk?.shutdown();
    sdk = undefined;
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  test('creates no exporter with the none exporter', async () => {
    configOverrides.TELEMETRY_LOGS_ENABLED = true;

    sdk = await startTelemetry();

    expect(options.spanProcessors).toHaveLength(0);
    expect(options.metricReaders).toHaveLength(0);
    expect(options.logRecordProcessors).toHaveLength(0);
    expect(options.sampler.toString()).toContain(
      'ParentBased{root=AlwaysOnSampler,'
    );
  });

  test('exports to the standard output with the console exporter', async () => {
    configOverrides.TELEMETRY_EXPORTER = 'console';
    configOverrides.TELEMETRY_LOGS_ENABLED = true;

    sdk = await startTelemetry();

    expect(options.spanProcessors[0].constructor.name).toBe(
      'SimpleSpanProcessor'
    );
    expect(options.metricReaders).toHaveLength(1);
    expect(options.logRecordProcessors[0].constructor.name).toBe(
      'SimpleLogRecordProcessor'
    );
  });

  test('leaves the endpoint and the headers of OTLP to the OTEL environment variables by default', async () => {
    configOverrides.TELEMETRY_EXPORTER = 'otlp';

    sdk = await startTelemetry();

    expect(created(OTLPTraceExporter)).toEqual([{ timeoutMillis: 10_000 }]);
    expect(created(OTLPMetricExporter)).toEqual([{ timeoutMillis: 10_000 }]);
    // The logs are not exported by default
    expect(created(OTLPLogExporter)).toEqual([]);
    expect(options.spanProcessors[0].constructor.name).toBe(
      'BatchSpanProcessor'
    );
  });

  test('exports every signal to the configured endpoint with the headers', async () => {
    configOverrides.TELEMETRY_EXPORTER = 'otlp';
    configOverrides.TELEMETRY_ENDPOINT = 'https://otlp.example.com/';
    configOverrides.TELEMETRY_HEADERS = [
      'x-api-key=secret=value',
      ' x-dataset = shop ',
      'no-value'
    ];
    configOverrides.TELEMETRY_TIMEOUT = 2000;
    configOverrides.TELEMETRY_METRICS_ENDPOINT =
      'https://metrics.example.com/m';
    configOverrides.TELEMETRY_LOGS_ENABLED = true;

    sdk = await startTelemetry();

    const headers = { 'x-api-key': 'secret=value', 'x-dataset': 'shop' };
    expect(created(OTLPTraceExporter)).toEqual([
      {
        timeoutMillis: 2000,
        url: 'https://otlp.example.com/v1/traces',
        headers
      }
    ]);
    expect(created(OTLPMetricExporter)).toEqual([
      { timeoutMillis: 2000, url: 'https://metrics.example.com/m', headers }
    ]);
    expect(created(OTLPLogExporter)).toEqual([
      { timeoutMillis: 2000, url: 'https://otlp.example.com/v1/logs', headers }
    ]);
  });

  test('encodes the requests as JSON with the http/json protocol', async () => {
    configOverrides.TELEMETRY_EXPORTER = 'otlp';
    configOverrides.TELEMETRY_PROTOCOL = 'http/json';
    configOverrides.TELEMETRY_LOGS_ENABLED = true;

    sdk = await startTelemetry();

    expect(created(JsonTraceExporter)).toHaveLength(1);
    expect(created(JsonLogExporter)).toHaveLength(1);
    expect(created(OTLPTraceExporter)).toHaveLength(0);
  });

  test('samples the configured ratio of the new traces', async () => {
    configOverrides.TELEMETRY_TRACES_SAMPLE_RATIO = 0.25;

    sdk = await startTelemetry();

    expect(options.sampler.toString()).toContain(
      'ParentBased{root=TraceIdRatioBased{0.25},'
    );
  });

  test('traces the fetch requests on Node unless switched off', async () => {
    sdk = await startTelemetry();
    expect(
      options.instrumentations.map((entry) => entry.instrumentationName)
    ).toEqual(['@opentelemetry/instrumentation-undici']);
    await sdk!.shutdown();

    configOverrides.TELEMETRY_INSTRUMENTATIONS_FETCH = false;
    sdk = await startTelemetry();
    expect(options.instrumentations).toEqual([]);
    await sdk!.shutdown();

    delete configOverrides.TELEMETRY_INSTRUMENTATIONS_FETCH;
    configOverrides.APP_RUNTIME = 'bun';
    sdk = await startTelemetry();
    expect(options.instrumentations).toEqual([]);
  });

  test('logs a failing flush and shutdown instead of throwing', async () => {
    const warn = jest
      .spyOn(createLogger('telemetry'), 'warn')
      .mockImplementation();
    remove();
    remove = configureTelemetry((value) => {
      value.spanProcessors.push({
        onStart: () => undefined,
        onEnd: () => undefined,
        forceFlush: async () => {
          throw new Error('collector down');
        },
        shutdown: async () => {
          throw new Error('collector down');
        }
      });
    });
    sdk = await startTelemetry();

    await expect(sdk!.forceFlush()).resolves.toBeUndefined();
    await expect(sdk!.shutdown()).resolves.toBeUndefined();
    sdk = undefined;

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.anything() }),
      'OpenTelemetry flush failed'
    );
    expect(warn).toHaveBeenCalledWith(
      expect.anything(),
      'OpenTelemetry shutdown failed'
    );
    warn.mockRestore();
  });
});
