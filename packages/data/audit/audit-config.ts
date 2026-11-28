import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const auditConfig = defineConfig('audit', {
  /** Record the requests and the changes of the records in the `AuditLog` and `AuditChange` tables. Default:
   * `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** How long the entries are kept, a duration (`90d`), overridden by the `retention` of a category, empty to keep
   * them all. Default: `'90d'`. */
  RETENTION: Type.String({ default: '90d' }),
  /** How often the entries older than their retention are deleted, a duration. Default: `'1h'`. */
  RETENTION_INTERVAL: Type.String({ default: '1h' }),
  /** Delete the expired entries in this instance, `false` for the other instances of an application whose deletes run
   * in one instance (or in a task calling `AuditService.purge`). Default: `true`. */
  RETENTION_WORKER: Type.Boolean({ default: true }),
  /** How often the buffered entries are written to the database, a duration. Default: `'1s'`. */
  FLUSH_INTERVAL: Type.String({ default: '1s' }),
  /** The number of buffered entries written at once without waiting for the flush interval. Default: `100`. */
  BATCH_SIZE: Type.Integer({ minimum: 1, default: 100 }),
  /** The most entries buffered, i.e. while the database is unavailable, the oldest ones dropped beyond it, counted in
   * the `appweaver.audit.dropped` metric. Default: `10000`. */
  MAX_BUFFER: Type.Integer({ minimum: 1, default: 10000 }),
  /** How the batches are written: `direct` to the database, or `queue` as a job of the `audit` queue, which the
   * instances with `audit.writeWorker` write. Default: `'direct'`. */
  WRITE_VIA: Type.Enum({ direct: 'direct', queue: 'queue' } as const, {
    default: 'direct'
  }),
  /** Write the batches of the `audit` queue in this instance, with `audit.writeVia: 'queue'`, `false` for the instances
   * only sending them. Default: `true`. */
  WRITE_WORKER: Type.Boolean({ default: true }),
  /** Models whose requests and changes are left out, i.e. `['Session']`. Default: `[]`. */
  EXCLUDE_MODELS: Type.Array(Type.String(), { default: [] }),
  /** Actions left out, of every model (`find`, `export`, `auth.refresh`) or of one (`Post.update`). Default: `[]`. */
  EXCLUDE_ACTIONS: Type.Array(Type.String(), { default: [] }),
  /** Names of the keys and fields whose values are redacted besides the hidden fields, the `redact` fields and the
   * names of secrets (`password`, `token`, `apiKey`, ...), compared case-insensitively. Default: `['code']`. */
  REDACT_KEYS: Type.Array(Type.String(), { default: ['code'] }),
  /** Record the client addresses without their last octet (IPv4) or their last 80 bits (IPv6). Default: `false`. */
  ANONYMIZE_IP: Type.Boolean({ default: false }),
  /** The longest value of a field stored in a diff or a request body, in characters of its JSON, a longer one stored
   * truncated. Default: `2048`. */
  MAX_VALUE_SIZE: Type.Integer({ minimum: 16, default: 2048 })
});

export const auditChangesConfig = defineConfig('audit.changes', {
  /** Record the changed fields of the records created, updated and deleted through the resource services, in the
   * `AuditChange` table. Default: `true`. */
  ENABLED: Type.Boolean({ default: true }),
  /** How long the entries of the changes made outside of a request (jobs, tasks) are kept, a duration, empty for
   * `audit.retention`. Default: `''`. */
  RETENTION: Type.String({ default: '' })
});

export const auditAuthConfig = defineConfig('audit.auth', {
  /** Record the requests of the authentication and account routes (`/auth`), failed ones included. Default:
   * `true`. */
  ENABLED: Type.Boolean({ default: true }),
  /** How long the entries are kept, a duration, empty for `audit.retention`. Default: `''`. */
  RETENTION: Type.String({ default: '' })
});

export const auditReadConfig = defineConfig('audit.read', {
  /** Record the reading requests: the `find`, `query`, `aggregate` and `export` routes and the `GET` routes.
   * Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** How long the entries are kept, a duration, empty for `audit.retention`. Default: `''`. */
  RETENTION: Type.String({ default: '' })
});

export const auditWriteConfig = defineConfig('audit.write', {
  /** Record the writing requests: the create, update, delete, bulk and file routes and the routes of the other
   * methods. Default: `true`. */
  ENABLED: Type.Boolean({ default: true }),
  /** How long the entries are kept, a duration, empty for `audit.retention`. Default: `''`. */
  RETENTION: Type.String({ default: '' })
});

export const auditCustomConfig = defineConfig('audit.custom', {
  /** Record the entries the application adds with `AuditService.record`. Default: `true`. */
  ENABLED: Type.Boolean({ default: true }),
  /** How long the entries are kept, a duration, empty for `audit.retention`. Default: `''`. */
  RETENTION: Type.String({ default: '' })
});

export const auditRoutesConfig = defineConfig('audit.routes', {
  /** Register the read-only routes of the audit log (`/audit-logs` and `/audit-changes`: `find` and `query`), left
   * out of the audit log themselves, with the service and the policy of the models. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** The roles allowed to read them. Default: `['Admin']`. */
  ROLES: Type.Array(Type.String(), { default: ['Admin'] })
});
