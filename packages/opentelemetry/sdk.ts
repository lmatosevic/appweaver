import {
  Attributes,
  context,
  isSpanContextValid,
  logs,
  metrics,
  propagation,
  trace
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  CompositePropagator,
  W3CBaggagePropagator,
  W3CTraceContextPropagator
} from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import {
  defaultResource,
  detectResources,
  envDetector,
  Resource,
  resourceFromAttributes
} from '@opentelemetry/resources';
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  LoggerProvider,
  LogRecordExporter,
  LogRecordProcessor,
  SimpleLogRecordProcessor
} from '@opentelemetry/sdk-logs';
import {
  ConsoleMetricExporter,
  IMetricReader,
  MeterProvider,
  PeriodicExportingMetricReader,
  PushMetricExporter
} from '@opentelemetry/sdk-metrics';
import {
  AlwaysOnSampler,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  ParentBasedSampler,
  SimpleSpanProcessor,
  SpanExporter,
  SpanProcessor,
  TraceIdRatioBasedSampler,
  TracerProvider
} from '@opentelemetry/sdk-trace';
import {
  addLogDestination,
  appConfig,
  createLogger,
  Runtime,
  TELEMETRY_SCOPE
} from '@appweaver/common';
import {
  logsConfig,
  metricsConfig,
  openTelemetryConfig,
  OtlpProtocol,
  sdkInstrumentationsConfig,
  TelemetryExporter,
  tracesConfig
} from './config';
import {
  applyTelemetryConfigurers,
  TelemetryOptions
} from './configure-telemetry';
import { createLogBridge } from './log-bridge';

const logger = createLogger('telemetry');

/** The signals of OpenTelemetry, each with its own OTLP path. */
type Signal = 'traces' | 'metrics' | 'logs';

/** The OpenTelemetry SDK of the application, once started. */
export type TelemetrySdk = {
  /** The resource describing the service. */
  resource: Resource;
  /** The provider of the tracers, `undefined` with the traces disabled. */
  tracerProvider?: TracerProvider;
  /** The provider of the meters, `undefined` with the metrics disabled. */
  meterProvider?: MeterProvider;
  /** The provider of the loggers, `undefined` with the log export disabled. */
  loggerProvider?: LoggerProvider;
  /** Exports the telemetry recorded so far. */
  forceFlush(): Promise<void>;
  /** Exports the telemetry recorded so far, then stops the SDK and unregisters it. */
  shutdown(): Promise<void>;
};

/**
 * Starts the OpenTelemetry SDK from the `telemetry` config and the functions of `configureTelemetry`, registering its
 * tracer, meter and logger providers, its context manager and its propagator globally, so the instrumentation of the
 * framework and of the application records into them.
 *
 * @return {Promise<TelemetrySdk | undefined>} The started SDK, or `undefined` when another OpenTelemetry SDK is
 * already registered, which then receives the telemetry instead.
 */
export async function startTelemetry(): Promise<TelemetrySdk | undefined> {
  if (sdkRegistered()) {
    logger.warn(
      'Another OpenTelemetry SDK is already registered, the telemetry is recorded by it and the `telemetry` config ' +
        'of the exporters is not used'
    );
    return undefined;
  }

  const options = applyTelemetryConfigurers(await defaultOptions());
  const resource = createResource(options.resourceAttributes);
  const stops: (() => unknown)[] = [];

  let tracerProvider: TracerProvider | undefined;
  if (tracesConfig.ENABLED) {
    tracerProvider = new TracerProvider({
      resource,
      sampler: options.sampler,
      idGenerator: options.idGenerator,
      spanProcessors: options.spanProcessors
    });
    trace.setGlobalTracerProvider(tracerProvider);
    const contextManager =
      options.contextManager ?? new AsyncLocalStorageContextManager();
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
    propagation.setGlobalPropagator(options.propagator);
    stops.push(() => {
      trace.disable();
      context.disable();
      propagation.disable();
    });
  }

  let meterProvider: MeterProvider | undefined;
  if (metricsConfig.ENABLED) {
    meterProvider = new MeterProvider({
      resource,
      readers: options.metricReaders,
      views: options.views
    });
    metrics.setGlobalMeterProvider(meterProvider);
    stops.push(() => metrics.disable());
  }

  let loggerProvider: LoggerProvider | undefined;
  if (logsConfig.ENABLED) {
    loggerProvider = new LoggerProvider({
      resource,
      processors: options.logRecordProcessors
    });
    logs.setGlobalLoggerProvider(loggerProvider);
    const removeDestination = addLogDestination(
      createLogBridge(),
      logsConfig.LEVEL
    );
    stops.push(() => {
      removeDestination();
      logs.disable();
    });
  }

  if (options.instrumentations.length > 0) {
    stops.push(
      registerInstrumentations({
        instrumentations: options.instrumentations,
        tracerProvider,
        meterProvider,
        loggerProvider
      })
    );
  }

  const providers = [tracerProvider, meterProvider, loggerProvider].filter(
    (provider) => provider !== undefined
  );

  logger.info(
    {
      service: resource.attributes['service.name'],
      exporter: openTelemetryConfig.EXPORTER,
      traces: tracesConfig.ENABLED,
      metrics: metricsConfig.ENABLED,
      logs: logsConfig.ENABLED
    },
    'OpenTelemetry started'
  );

  return {
    resource,
    tracerProvider,
    meterProvider,
    loggerProvider,
    forceFlush: async () => {
      await settle(
        'flush',
        providers.map((provider) => provider.forceFlush())
      );
    },
    shutdown: async () => {
      // The loggers stop writing to the providers before they shut down
      for (const stop of stops.reverse()) {
        stop();
      }
      await settle(
        'shutdown',
        providers.map((provider) => provider.shutdown())
      );
    }
  };
}

/** Tells whether a tracer provider is registered, the tracer of an SDK giving its spans an id. */
function sdkRegistered(): boolean {
  const probe = trace.getTracer(TELEMETRY_SCOPE).startSpan('probe', {
    root: true
  });
  return isSpanContextValid(probe.spanContext());
}

/** Creates the options of the SDK from the config. */
async function defaultOptions(): Promise<TelemetryOptions> {
  const exporter = openTelemetryConfig.EXPORTER ?? TelemetryExporter.None;
  const options: TelemetryOptions = {
    resourceAttributes: parsePairs(
      openTelemetryConfig.RESOURCE_ATTRIBUTES,
      'telemetry.resourceAttributes'
    ),
    spanProcessors: [],
    sampler: new ParentBasedSampler({
      root:
        tracesConfig.SAMPLE_RATIO >= 1
          ? new AlwaysOnSampler()
          : new TraceIdRatioBasedSampler(tracesConfig.SAMPLE_RATIO)
    }),
    propagator: new CompositePropagator({
      propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()]
    }),
    metricReaders: [],
    views: [],
    logRecordProcessors: [],
    instrumentations: []
  };

  if (tracesConfig.ENABLED) {
    const processor = await spanProcessor(exporter);
    if (processor) {
      options.spanProcessors.push(processor);
    }
  }
  if (metricsConfig.ENABLED) {
    const reader = await metricReader(exporter);
    if (reader) {
      options.metricReaders.push(reader);
    }
  }
  if (logsConfig.ENABLED) {
    const processor = await logRecordProcessor(exporter);
    if (processor) {
      options.logRecordProcessors.push(processor);
    }
  }

  // Bun does not publish the requests of fetch on the diagnostics channels
  // the instrumentation subscribes to
  if (
    sdkInstrumentationsConfig.FETCH &&
    tracesConfig.ENABLED &&
    appConfig.RUNTIME === Runtime.Node
  ) {
    const { UndiciInstrumentation } =
      await import('@opentelemetry/instrumentation-undici');
    options.instrumentations.push(new UndiciInstrumentation());
  }

  return options;
}

/**
 * Creates the resource of the service: the attributes of the SDK, the application (`app.name`, `app.version`,
 * `app.env`), the `OTEL_SERVICE_NAME` and `OTEL_RESOURCE_ATTRIBUTES` environment variables, then the `telemetry`
 * config, each overriding the ones before it.
 */
function createResource(attributes: Attributes): Resource {
  return defaultResource()
    .merge(
      resourceFromAttributes({
        'service.name': appConfig.NAME,
        'service.version': appConfig.VERSION,
        'deployment.environment.name': appConfig.ENV
      })
    )
    .merge(detectResources({ detectors: [envDetector] }))
    .merge(
      resourceFromAttributes({
        ...(openTelemetryConfig.SERVICE_NAME
          ? { 'service.name': openTelemetryConfig.SERVICE_NAME }
          : {}),
        ...(openTelemetryConfig.SERVICE_VERSION
          ? { 'service.version': openTelemetryConfig.SERVICE_VERSION }
          : {}),
        ...attributes
      })
    );
}

async function spanProcessor(
  exporter: TelemetryExporter
): Promise<SpanProcessor | undefined> {
  if (exporter === TelemetryExporter.Console) {
    return new SimpleSpanProcessor({ exporter: new ConsoleSpanExporter() });
  }
  if (exporter !== TelemetryExporter.Otlp) {
    return undefined;
  }
  const { OTLPTraceExporter } =
    openTelemetryConfig.PROTOCOL === OtlpProtocol.Json
      ? await import('@opentelemetry/exporter-trace-otlp-http')
      : await import('@opentelemetry/exporter-trace-otlp-proto');
  const otlp: SpanExporter = new OTLPTraceExporter(otlpOptions('traces'));
  return new BatchSpanProcessor({ exporter: otlp });
}

async function metricReader(
  exporter: TelemetryExporter
): Promise<IMetricReader | undefined> {
  let metricExporter: PushMetricExporter;
  if (exporter === TelemetryExporter.Console) {
    metricExporter = new ConsoleMetricExporter();
  } else if (exporter === TelemetryExporter.Otlp) {
    const { OTLPMetricExporter } =
      openTelemetryConfig.PROTOCOL === OtlpProtocol.Json
        ? await import('@opentelemetry/exporter-metrics-otlp-http')
        : await import('@opentelemetry/exporter-metrics-otlp-proto');
    metricExporter = new OTLPMetricExporter(otlpOptions('metrics'));
  } else {
    return undefined;
  }
  return new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: metricsConfig.INTERVAL,
    // An export must end before the next one starts
    exportTimeoutMillis: Math.min(
      openTelemetryConfig.TIMEOUT,
      metricsConfig.INTERVAL
    )
  });
}

async function logRecordProcessor(
  exporter: TelemetryExporter
): Promise<LogRecordProcessor | undefined> {
  if (exporter === TelemetryExporter.Console) {
    return new SimpleLogRecordProcessor({
      exporter: new ConsoleLogRecordExporter()
    });
  }
  if (exporter !== TelemetryExporter.Otlp) {
    return undefined;
  }
  const { OTLPLogExporter } =
    openTelemetryConfig.PROTOCOL === OtlpProtocol.Json
      ? await import('@opentelemetry/exporter-logs-otlp-http')
      : await import('@opentelemetry/exporter-logs-otlp-proto');
  const otlp: LogRecordExporter = new OTLPLogExporter(otlpOptions('logs'));
  return new BatchLogRecordProcessor({ exporter: otlp });
}

/**
 * Returns the options of an OTLP exporter. A URL or a header left out is read by the exporter from the standard
 * `OTEL_EXPORTER_OTLP_*` environment variables, the URL then defaulting to `http://localhost:4318`.
 */
function otlpOptions(signal: Signal): {
  timeoutMillis: number;
  url?: string;
  headers?: Record<string, string>;
} {
  const signalEndpoint = {
    traces: tracesConfig.ENDPOINT,
    metrics: metricsConfig.ENDPOINT,
    logs: logsConfig.ENDPOINT
  }[signal];
  const url =
    signalEndpoint ??
    (openTelemetryConfig.ENDPOINT
      ? `${openTelemetryConfig.ENDPOINT.replace(/\/+$/, '')}/v1/${signal}`
      : undefined);
  const headers = parsePairs(openTelemetryConfig.HEADERS, 'telemetry.headers');
  return {
    timeoutMillis: openTelemetryConfig.TIMEOUT,
    ...(url ? { url } : {}),
    ...(Object.keys(headers).length > 0 ? { headers } : {})
  };
}

/** Parses the `name=value` entries of a config key, warning of an entry without a name or a value. */
function parsePairs(entries: string[], key: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const entry of entries) {
    const separator = entry.indexOf('=');
    const name = entry.slice(0, separator).trim();
    if (separator < 1 || !name) {
      logger.warn(`The entry of ${key} is not a name=value pair, ignoring it`);
      continue;
    }
    pairs[name] = entry.slice(separator + 1).trim();
  }
  return pairs;
}

/** Waits for the providers, logging the ones failing instead of failing the application. */
async function settle(
  action: string,
  promises: Promise<unknown>[]
): Promise<void> {
  for (const result of await Promise.allSettled(promises)) {
    if (result.status === 'rejected') {
      logger.warn({ err: result.reason }, `OpenTelemetry ${action} failed`);
    }
  }
}
