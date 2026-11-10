import { Type } from '@sinclair/typebox';
import { defineConfig } from '../config/define-config';

export const telemetryConfig = defineConfig('telemetry', {
  /** Enable the OpenTelemetry instrumentation of the framework. The spans and metrics are recorded once an
   * OpenTelemetry SDK is registered, i.e. by the `@appweaver/opentelemetry` module. Default: `true`. */
  ENABLED: Type.Boolean({ default: true }),
  /** Add the `trace_id`, `span_id` and `trace_flags` of the active span to every log record. Default: `true`. */
  LOG_CORRELATION: Type.Boolean({ default: true })
});

export const telemetryInstrumentationsConfig = defineConfig(
  'telemetry.instrumentations',
  {
    /** Trace and measure the requests of the HTTP server. Default: `true`. */
    HTTP: Type.Boolean({ default: true }),
    /** Trace and measure the database operations. Default: `true`. */
    DATABASE: Type.Boolean({ default: true }),
    /** Trace and measure the queue jobs, carrying the trace from the sender to the worker. Default: `true`. */
    QUEUE: Type.Boolean({ default: true }),
    /** Trace and measure the runs of the scheduled jobs. Default: `true`. */
    SCHEDULER: Type.Boolean({ default: true }),
    /** Trace the emails the mailer sends. Default: `true`. */
    MAILER: Type.Boolean({ default: true }),
    /** Trace the text messages the SMS sender sends. Default: `true`. */
    SMS: Type.Boolean({ default: true }),
    /** Count the cache hits and misses. Default: `true`. */
    CACHE: Type.Boolean({ default: true }),
    /** Trace the tasks of `weaver run`. Default: `true`. */
    TASK: Type.Boolean({ default: true })
  }
);
