/** The kind of an audit log entry, each enabled and kept on its own (`audit.<category>`). */
export type AuditCategory = 'auth' | 'read' | 'write' | 'change' | 'custom';

/** Where an audited action came from. */
export type AuditSource =
  | 'http'
  | 'mcp'
  | 'realtime'
  | 'job'
  | 'task'
  | 'system';

/** The change of one field of a record, `from` absent on a create and `to` absent on a delete. */
export type AuditFieldChange = {
  from?: unknown;
  to?: unknown;
};

/** The changed fields of a record, keyed by their names. */
export type AuditDiff = Record<string, AuditFieldChange>;

/** A change of a record, written to the `AuditChange` table. */
export type AuditChangeEntry = {
  model: string;
  resourceId: string;
  action: 'create' | 'update' | 'delete';
  diff: AuditDiff;
};

/** An entry of the audit log, written to the `AuditLog` table. */
export type AuditEntry = {
  category: AuditCategory;
  source?: AuditSource;
  /** The action, i.e. `create`, `auth.login` or `invoice.sent` */
  action?: string;
  method?: string;
  /** The route template, i.e. `/api/posts/:id` */
  route?: string;
  path?: string;
  query?: Record<string, unknown>;
  body?: unknown;
  status?: number;
  errorCode?: string;
  /** Milliseconds */
  duration?: number;
  /** The authenticated user, taken from the auth context when not set */
  userId?: string | number | null;
  authType?: string | null;
  apiKeyId?: string | number | null;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  traceId?: string;
  model?: string;
  resourceId?: string | number;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
};
