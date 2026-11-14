import { Type } from '@sinclair/typebox';
import {
  appConfig,
  defineConfig,
  Environment,
  LogLevel
} from '@appweaver/common';

/** Where the telemetry is exported to. */
export enum TelemetryExporter {
  /** An OTLP endpoint over HTTP: a collector, or the OTLP intake of a vendor. */
  Otlp = 'otlp',
  /** The standard output, to read the telemetry while developing. */
  Console = 'console',
  /** Nowhere, leaving the export to the processors added with `configureTelemetry`. */
  None = 'none'
}

/** The encoding of the OTLP requests. */
export enum OtlpProtocol {
  Protobuf = 'http/protobuf',
  Json = 'http/json'
}

export const openTelemetryConfig = defineConfig(
  'telemetry',
  {
    /** Name of the service in the telemetry. Default: the `OTEL_SERVICE_NAME` environment variable, otherwise the
     * application name (`app.name`). */
    SERVICE_NAME: Type.Optional(Type.String()),
    /** Version of the service in the telemetry. Default: the application version (`app.version`). */
    SERVICE_VERSION: Type.Optional(Type.String()),
    /** Resource attributes describing the service, as `name=value` entries, i.e. `['service.namespace=shop']`, added
     * to the ones of the `OTEL_RESOURCE_ATTRIBUTES` environment variable. Default: `[]`. */
    RESOURCE_ATTRIBUTES: Type.Array(Type.String(), { default: [] }),
    /** Exporter of the telemetry: `otlp`, `console` or `none`. Default: `'otlp'`, and `'none'` in the `test`
     * environment. */
    EXPORTER: Type.Optional(Type.Enum(TelemetryExporter)),
    /** Base URL of the OTLP endpoint, the signal paths (`/v1/traces`, ...) are appended to it. Default: the
     * `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable, otherwise `http://localhost:4318`. */
    ENDPOINT: Type.Optional(Type.String()),
    /** Headers of the OTLP requests, as `name=value` entries, i.e. `['x-honeycomb-team=<api key>']`, added to the
     * ones of the `OTEL_EXPORTER_OTLP_HEADERS` environment variable. Default: `[]`. */
    HEADERS: Type.Array(Type.String(), { default: [], secret: true }),
    /** Encoding of the OTLP requests: `http/protobuf` or `http/json`. Default: `'http/protobuf'`. */
    PROTOCOL: Type.Enum(OtlpProtocol, { default: OtlpProtocol.Protobuf }),
    /** Timeout of an export request in milliseconds. Default: `10000` (10 sec). */
    TIMEOUT: Type.Integer({ default: 10_000, minimum: 1 })
  },
  {
    transform: (values) => ({
      ...values,
      EXPORTER:
        values.EXPORTER ??
        ((appConfig.ENV as Environment) === Environment.Test
          ? TelemetryExporter.None
          : TelemetryExporter.Otlp)
    })
  }
);

export const tracesConfig = defineConfig('telemetry.traces', {
  /** Record and export the traces. Default: `true`. */
  ENABLED: Type.Boolean({ default: true }),
  /** Ratio of the traces recorded, from `0` to `1`. A trace continued from another service follows the decision of
   * that service. Default: `1`. */
  SAMPLE_RATIO: Type.Number({ default: 1, minimum: 0, maximum: 1 }),
  /** Full URL of the OTLP traces endpoint, overriding `telemetry.endpoint` for the traces. */
  ENDPOINT: Type.Optional(Type.String())
});

export const metricsConfig = defineConfig('telemetry.metrics', {
  /** Record and export the metrics. Default: `true`. */
  ENABLED: Type.Boolean({ default: true }),
  /** Interval between two exports of the metrics in milliseconds. Default: `60000` (1 min). */
  INTERVAL: Type.Integer({ default: 60_000, minimum: 1000 }),
  /** Full URL of the OTLP metrics endpoint, overriding `telemetry.endpoint` for the metrics. */
  ENDPOINT: Type.Optional(Type.String())
});

export const logsConfig = defineConfig('telemetry.logs', {
  /** Export the log records of the application loggers, besides writing them to the console and the log file.
   * Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** Lowest level of the exported log records, which never lowers the level a logger writes at (`log.level`).
   * Default: `'info'`. */
  LEVEL: Type.Enum(LogLevel, { default: LogLevel.Info }),
  /** Full URL of the OTLP logs endpoint, overriding `telemetry.endpoint` for the logs. */
  ENDPOINT: Type.Optional(Type.String())
});

export const sdkInstrumentationsConfig = defineConfig(
  'telemetry.instrumentations',
  {
    /** Trace the outbound `fetch` requests, sending the trace context to the services they call. Node.js only.
     * Default: `true`. */
    FETCH: Type.Boolean({ default: true })
  }
);
