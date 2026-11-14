export * from './telemetry-config';
export * from './telemetry';
export * from './queue-telemetry';

// The parts of the OpenTelemetry API the instrumentation of a package needs
export { SpanKind, SpanStatusCode } from '@opentelemetry/api';
export type {
  Span,
  SpanOptions,
  Context as TraceContext
} from '@opentelemetry/api';
