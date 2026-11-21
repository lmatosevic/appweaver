import {
  AuditDiff,
  isSecretName,
  REDACTED,
  redactSecrets,
  ResourceModelConfig
} from '@appweaver/common';

/** The options of {@link diffRecords}. */
export type DiffOptions = {
  /** The names of the fields and keys redacted besides the secret names. */
  redactKeys: string[];
  /** The longest value of a field, in characters of its JSON. */
  maxValueSize: number;
};

// Set by the database, so never a change of the record
const SKIPPED_FIELDS = new Set(['id', 'createdAt', 'updatedAt', '_count']);

/**
 * Compares two states of a record field by field: the fields set on a create (`to`), the changed fields of an update
 * (`from` and `to`), the fields of a deleted record (`from`). A relation is compared by the ids of its records, the
 * values of the redacted fields (the `redact` and `hidden` fields, and the ones named like a secret) are replaced with
 * `[Redacted]`, and a value longer than the limit is truncated.
 *
 * @param {ResourceModelConfig} config - The config of the model of the record.
 * @param {Object} [previous] - The record before the change, none for a create.
 * @param {Object} [current] - The record after the change, none for a delete.
 * @param {DiffOptions} options - The redacted names and the size limit.
 * @return {AuditDiff} The changed fields.
 */
export function diffRecords(
  config: ResourceModelConfig,
  previous: Record<string, any> | undefined,
  current: Record<string, any> | undefined,
  options: DiffOptions
): AuditDiff {
  const relations = new Set([
    ...Object.keys(config.relations ?? {}),
    ...Object.keys(config.files ?? {})
  ]);
  const fields = new Set([
    ...Object.keys(previous ?? {}),
    ...Object.keys(current ?? {})
  ]);

  const diff: AuditDiff = {};
  for (const field of fields) {
    if (SKIPPED_FIELDS.has(field)) {
      continue;
    }
    const relation = relations.has(field);
    const from = previous ? normalize(previous[field], relation) : undefined;
    const to = current ? normalize(current[field], relation) : undefined;

    if (previous && current) {
      if (from === undefined || to === undefined || same(from, to)) {
        continue;
      }
    } else if ((from ?? to) === undefined || (from ?? to) === null) {
      continue;
    }

    const redacted = isRedacted(config, field, options.redactKeys);
    const value = (state: unknown) =>
      redacted
        ? REDACTED
        : limit(redactSecrets(state, options.redactKeys), options.maxValueSize);
    diff[field] = {
      ...(previous ? { from: value(from) } : {}),
      ...(current ? { to: value(to) } : {})
    };
  }
  return diff;
}

/**
 * Shortens a value whose JSON is longer than the limit: a string to the limit, any other value to a note of its size.
 *
 * @param {unknown} value - The value.
 * @param {number} maxSize - The longest JSON, in characters.
 * @return {unknown} The value, or its shortened form.
 */
export function limit(value: unknown, maxSize: number): unknown {
  if (value === undefined || value === null) {
    return value;
  }
  const json = JSON.stringify(value) ?? '';
  if (json.length <= maxSize) {
    return value;
  }
  return typeof value === 'string'
    ? `${value.slice(0, maxSize)}…`
    : `[Truncated: ${json.length} characters]`;
}

/** Whether the values of a field are left out of the audit log. */
function isRedacted(
  config: ResourceModelConfig,
  field: string,
  redactKeys: string[]
): boolean {
  const scalar = config.scalars?.[field];
  return (
    !!scalar?.redact || !!scalar?.hidden || isSecretName(field, redactKeys)
  );
}

/** Converts a value to its JSON form, a related record to its id. */
function normalize(value: unknown, relation: boolean): unknown {
  if (value === undefined || value === null) {
    return value;
  }
  if (relation) {
    if (Array.isArray(value)) {
      return value.map((item) => normalize(item, true)).sort(compareIds);
    }
    if (typeof value === 'object' && 'id' in value) {
      return normalize(value.id, false);
    }
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value instanceof Uint8Array) {
    return `[${value.byteLength} bytes]`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item, false));
  }
  if (typeof value === 'object') {
    // i.e. a Prisma Decimal
    if (typeof (value as { toJSON?: unknown }).toJSON === 'function') {
      return (value as { toJSON: () => unknown }).toJSON();
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalize(item, false)])
    );
  }
  return value;
}

function same(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function compareIds(a: unknown, b: unknown): number {
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}
