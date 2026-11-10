import {
  Attributes,
  ContextManager,
  TextMapPropagator
} from '@opentelemetry/api';
import { Instrumentation } from '@opentelemetry/instrumentation';
import { LogRecordProcessor } from '@opentelemetry/sdk-logs';
import { IMetricReader, ViewOptions } from '@opentelemetry/sdk-metrics';
import { IdGenerator, Sampler, SpanProcessor } from '@opentelemetry/sdk-trace';

/**
 * What the OpenTelemetry SDK is started with: the parts created from the `telemetry` config, which the functions of
 * {@link configureTelemetry} add to, replace or remove.
 */
export type TelemetryOptions = {
  /** The attributes of the resource, the service the telemetry describes. */
  resourceAttributes: Attributes;
  /** The span processors, the batch processor of the configured exporter by default. */
  spanProcessors: SpanProcessor[];
  /** The sampler deciding which traces are recorded. */
  sampler: Sampler;
  /** The propagator reading and writing the trace context of the requests and the queue jobs. */
  propagator: TextMapPropagator;
  /** The metric readers, the periodic reader of the configured exporter by default. */
  metricReaders: IMetricReader[];
  /** The views customizing the metrics, i.e. the buckets of a histogram. */
  views: ViewOptions[];
  /** The log record processors, the batch processor of the configured exporter by default. */
  logRecordProcessors: LogRecordProcessor[];
  /** The instrumentations of the libraries, the one of `fetch` by default. */
  instrumentations: Instrumentation[];
  /** The generator of the trace and span ids, i.e. the one of AWS X-Ray. */
  idGenerator?: IdGenerator;
  /** The context manager. Default: the `AsyncLocalStorage` one. */
  contextManager?: ContextManager;
};

/** Changes the options the OpenTelemetry SDK is started with. */
export type TelemetryConfigurer = (options: TelemetryOptions) => void;

const configurers: TelemetryConfigurer[] = [];

/**
 * Registers a function changing what the OpenTelemetry SDK is started with, to send the telemetry to a backend the
 * `telemetry` config does not cover: another exporter, a vendor's span processor, a sampler, an id generator, the
 * instrumentation of a library. Call it before the application starts, i.e. in an application file or the `main`
 * part of a module.
 *
 * @example
 * configureTelemetry((options) => {
 *   options.spanProcessors.push(new BatchSpanProcessor({ exporter: new AzureMonitorTraceExporter() }));
 *   options.instrumentations.push(new PrismaInstrumentation());
 * });
 *
 * @param {TelemetryConfigurer} configurer - Receives the options, changing them in place.
 * @return {Function} Removes the function again.
 */
export function configureTelemetry(
  configurer: TelemetryConfigurer
): () => void {
  configurers.push(configurer);
  return () => {
    const index = configurers.indexOf(configurer);
    if (index >= 0) {
      configurers.splice(index, 1);
    }
  };
}

/**
 * Applies the registered functions to the options, in the order they were registered.
 *
 * @param {TelemetryOptions} options - The options created from the config.
 * @return {TelemetryOptions} The same options.
 */
export function applyTelemetryConfigurers(
  options: TelemetryOptions
): TelemetryOptions {
  for (const configurer of configurers) {
    configurer(options);
  }
  return options;
}
