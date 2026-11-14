import { Attributes, logs, SeverityNumber } from '@opentelemetry/api';
import { TELEMETRY_SCOPE } from '@appweaver/common';

// The pino levels as OpenTelemetry severities
const SEVERITIES: Record<number, [SeverityNumber, string]> = {
  10: [SeverityNumber.TRACE, 'TRACE'],
  20: [SeverityNumber.DEBUG, 'DEBUG'],
  30: [SeverityNumber.INFO, 'INFO'],
  40: [SeverityNumber.WARN, 'WARN'],
  50: [SeverityNumber.ERROR, 'ERROR'],
  60: [SeverityNumber.FATAL, 'FATAL']
};

// The fields of a record that are not its attributes: its own parts, and the
// ids the SDK reads from the active span itself
const RESERVED = new Set([
  'level',
  'time',
  'msg',
  'pid',
  'hostname',
  'module',
  'err',
  'trace_id',
  'span_id',
  'trace_flags'
]);

/**
 * Creates the log destination emitting every record of the application loggers as an OpenTelemetry log record: the
 * message as its body, the level as its severity, the other fields as its attributes and the logger name
 * (`createLogger`) as the `appweaver.logger` attribute. A record written in a span carries its trace context.
 *
 * @return {Object} The destination, for `addLogDestination` of `@appweaver/common`.
 */
export function createLogBridge(): { write(record: string): void } {
  return {
    write(line: string): void {
      let record: Record<string, unknown>;
      try {
        record = JSON.parse(line);
      } catch {
        // Not a record of the logger
        return;
      }
      const [severityNumber, severityText] = SEVERITIES[
        record.level as number
      ] ?? [SeverityNumber.UNSPECIFIED, String(record.level)];

      logs.getLogger(TELEMETRY_SCOPE).emit({
        timestamp: record.time ? new Date(record.time as string) : undefined,
        severityNumber,
        severityText,
        body: typeof record.msg === 'string' ? record.msg : undefined,
        attributes: recordAttributes(record)
      });
    }
  };
}

/** Flattens the fields of a record into attributes, an error into the `exception.*` ones. */
function recordAttributes(record: Record<string, unknown>): Attributes {
  const attributes: Attributes = {};
  if (typeof record.module === 'string') {
    attributes['appweaver.logger'] = record.module;
  }
  const err = record.err as Record<string, unknown> | undefined;
  if (err && typeof err === 'object') {
    setAttribute(attributes, 'exception.type', err.type ?? err.name);
    setAttribute(attributes, 'exception.message', err.message);
    setAttribute(attributes, 'exception.stacktrace', err.stack);
    setAttribute(attributes, 'error.type', err.code);
  }
  for (const [key, value] of Object.entries(record)) {
    if (!RESERVED.has(key)) {
      setAttribute(attributes, key, value);
    }
  }
  return attributes;
}

/** Sets an attribute, flattening an object into dotted names and leaving out an empty value. */
function setAttribute(
  attributes: Attributes,
  name: string,
  value: unknown,
  depth = 0
): void {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== 'object') {
    attributes[name] = value;
  } else if (Array.isArray(value) || depth >= 2) {
    attributes[name] = JSON.stringify(value);
  } else {
    for (const [key, nested] of Object.entries(value)) {
      setAttribute(attributes, `${name}.${key}`, nested, depth + 1);
    }
  }
}
