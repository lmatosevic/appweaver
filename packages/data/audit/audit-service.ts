import {
  AuditCategory,
  AuditChangeEntry,
  AuditEntry,
  ConfigurationError,
  createLogger,
  currentTraceId,
  Database,
  ErrorCode,
  LIFECYCLE,
  OnDestroy,
  OnReady,
  OnShutdown,
  parseDuration,
  Queue,
  QueueProcessor,
  redactSecrets,
  removeUndefined,
  ResourceId,
  telemetryCounter,
  telemetryEnabled,
  uuidv7
} from '@appweaver/common';
import {
  currentApiKey,
  currentAuthType,
  currentAuthUser,
  currentRequestScope,
  inject,
  injectModel,
  isDefined,
  RequestScope
} from '@appweaver/core';
import { afterCommit, currentTransaction } from '@appweaver/core/internal';
import { PrismaDatabase } from '../database/prisma-database';
import type { Prisma } from '../prisma/client/client';
import {
  auditAuthConfig,
  auditChangesConfig,
  auditConfig,
  auditCustomConfig,
  auditReadConfig,
  auditWriteConfig
} from './audit-config';
import { diffRecords, limit } from './utils/diff-util';
import { anonymizeIp } from './utils/ip-util';

const logger = createLogger('audit');

/** The audit models, never audited themselves. */
const AUDIT_MODELS = new Set(['AuditLog', 'AuditChange']);

/** The ids of the expired entries deleted at once. */
const PURGE_BATCH_SIZE = 1000;

/** A row of the `AuditLog` table. */
type AuditLogRow = Prisma.AuditLogCreateManyInput & { id: string };

/** A row of the `AuditChange` table. */
type AuditChangeRow = Prisma.AuditChangeCreateManyInput;

/** A change of a record, whose diff is computed when it is written, off the request. */
type RecordChange = {
  model: string;
  resourceId: string;
  action: AuditChangeEntry['action'];
  previous?: Record<string, any>;
  current?: Record<string, any>;
  createdAt: Date;
};

/** A change of a request in flight, with the entry it gets when the request has none. */
type PendingChange = {
  change: RecordChange;
  standalone: AuditEntry;
};

/** An entry waiting to be written, with its changes. */
type BufferedEntry = {
  log: AuditLogRow;
  changes: RecordChange[];
  /** The entry of a change made outside of a request, left out when the change changed nothing. */
  standalone: boolean;
  attempts: number;
};

/** The rows of a batch, the job of the `audit` queue. */
type AuditBatch = {
  logs: AuditLogRow[];
  changes: AuditChangeRow[];
};

const droppedEntries = telemetryCounter('appweaver.audit.dropped', {
  description: 'Number of audit log entries dropped from a full buffer.',
  unit: '{entry}'
});
const writtenEntries = telemetryCounter('appweaver.audit.written', {
  description: 'Number of audit log entries written.',
  unit: '{entry}'
});

/**
 * Keeps the audit log: the requests the web module records, the changes of the records the resource services make, and
 * the entries of the application. The entries are buffered and written in batches, so a request never waits for its
 * entry, and deleted once older than the retention of their category.
 */
export class AuditService implements OnReady, OnShutdown, OnDestroy {
  static [LIFECYCLE] = true;

  /** @internal */
  private readonly _db = inject<PrismaDatabase>(Database as any);
  /** @internal */
  private _buffer: BufferedEntry[] = [];
  /** @internal The changes of the requests in flight, keyed by the id of their entry */
  private readonly _open = new Map<string, PendingChange[]>();
  /** @internal */
  private _flushing?: Promise<void>;
  /** @internal */
  private _flushTimer?: NodeJS.Timeout;
  /** @internal The flush interval in milliseconds, set once the service is ready. */
  private _flushInterval?: number;
  /** @internal */
  private _purgeTimer?: NodeJS.Timeout;
  /** @internal */
  private _dropped = 0;
  /** @internal The `audit` queue, with `audit.writeVia: 'queue'` */
  private _queue?: QueueProcessor<AuditBatch, void>;

  /** Whether the audit log is enabled. */
  public get enabled(): boolean {
    return auditConfig.ENABLED;
  }

  /**
   * Starts writing the buffered entries `audit.flushInterval` after they are recorded, and deleting the expired ones
   * at once and every `audit.retentionInterval`.
   *
   * @throws {ConfigurationError} `CONFIGURATION_INVALID` for an interval or a retention that is not a duration.
   */
  public onReady(): void {
    this.stopTimers();
    if (!this.enabled) {
      return;
    }

    this._flushInterval =
      seconds(auditConfig.FLUSH_INTERVAL, 'flush interval') * 1000;
    this.startQueue();
    // Entries recorded before the service was ready
    this.scheduleFlush();

    const retentions = this.retentions();
    if (retentions.size === 0 || !auditConfig.RETENTION_WORKER) {
      return;
    }
    const purgeInterval = seconds(
      auditConfig.RETENTION_INTERVAL,
      'retention interval'
    );
    const run = () =>
      void this.purge().catch((error) =>
        logger.error(error, 'Cannot delete the expired audit log entries')
      );
    this._purgeTimer = setInterval(run, purgeInterval * 1000);
    this._purgeTimer.unref();
    run();
  }

  /** Writes the entries buffered so far, before the services are destroyed. */
  public async onShutdown(): Promise<void> {
    await this.flush();
  }

  /** Stops the timers and writes the entries the last requests added. */
  public async onDestroy(): Promise<void> {
    this.stopTimers();
    await this.flush();
  }

  /**
   * Tells whether the entries of a category are recorded, the audit log being enabled.
   *
   * @param {AuditCategory} category - The category.
   * @return {boolean} True when they are.
   */
  public isCategoryEnabled(category: AuditCategory): boolean {
    return this.enabled && categoryConfig(category).ENABLED;
  }

  /**
   * Tells whether an action is left out of the audit log by `audit.excludeModels` or `audit.excludeActions`.
   *
   * @param {string} [model] - The model of the action.
   * @param {string} [action] - The action, i.e. `update` or `auth.login`.
   * @return {boolean} True when it is left out.
   */
  public isExcluded(model?: string, action?: string): boolean {
    if (
      model &&
      (AUDIT_MODELS.has(model) || includes(auditConfig.EXCLUDE_MODELS, model))
    ) {
      return true;
    }
    return (
      !!action &&
      (includes(auditConfig.EXCLUDE_ACTIONS, action) ||
        (!!model &&
          includes(auditConfig.EXCLUDE_ACTIONS, `${model}.${action}`)))
    );
  }

  /**
   * Adds an entry to the audit log, i.e. of an action of the application (`category: 'custom'`). The user, the source,
   * the client address and the trace are taken from the current call when not set. Nothing is recorded when the
   * category is disabled or the action excluded. The entry is written with the next batch.
   *
   * @example
   * auditService.record({ category: 'custom', action: 'invoice.sent', model: 'Invoice', resourceId: invoice.id });
   *
   * @param {AuditEntry} entry - The entry.
   * @return {boolean} True when the entry is recorded.
   */
  public record(entry: AuditEntry): boolean {
    if (
      !this.isCategoryEnabled(entry.category) ||
      this.isExcluded(entry.model, entry.action) ||
      currentRequestScope()?.excluded
    ) {
      return false;
    }
    return this.enqueue(this.toRow(uuidv7(), entry), []);
  }

  /**
   * Records the change of a record made by a resource service, as the changed fields of the record, once its
   * transaction commits. The change belongs to the entry of the request it is made in, or to an entry of its own made
   * outside of a request.
   *
   * @param {string} model - The model of the record.
   * @param {string} action - The action, `create`, `update` or `delete`.
   * @param {Object} [previous] - The record before the change, none for a create.
   * @param {Object} [current] - The record after the change, none for a delete.
   */
  public recordChange(
    model: string,
    action: AuditChangeEntry['action'],
    previous: Record<string, any> | undefined,
    current: Record<string, any> | undefined
  ): void {
    const scope = currentRequestScope();
    if (
      !this.isCategoryEnabled('change') ||
      scope?.excluded ||
      this.isExcluded(model, action)
    ) {
      return;
    }
    const resourceId = (current ?? previous)?.id as ResourceId | undefined;
    if (!injectModel(model, false) || resourceId === undefined) {
      return;
    }

    // The records are kept as they are, the services never change them, and compared when they are written
    const change: RecordChange = {
      model,
      resourceId: String(resourceId),
      action,
      previous,
      current,
      createdAt: new Date()
    };
    // Captured now, since the commit may run in another context
    const standalone = this.standaloneEntry(change, scope);
    const add = () => this.addChange(change, scope?.auditId, standalone);
    if (currentTransaction()) {
      afterCommit(add);
    } else {
      add();
    }
  }

  /**
   * Starts collecting the changes of a request, which {@link close} records with its entry. Called by the web module
   * for every request.
   *
   * @param {string} auditId - The id of the entry of the request.
   */
  public open(auditId: string): void {
    if (this.enabled) {
      this._open.set(auditId, []);
    }
  }

  /**
   * Ends a request: records its entry with its changes, or without an entry (its category disabled or its action
   * excluded) each change with an entry of its own. Called by the web module once a request responds.
   *
   * @param {string} auditId - The id of the entry of the request.
   * @param {AuditEntry} [entry] - The entry, none to record its changes alone.
   * @return {boolean} True when the entry is recorded.
   */
  public close(auditId: string, entry?: AuditEntry): boolean {
    const changes = this._open.get(auditId) ?? [];
    this._open.delete(auditId);
    if (!this.enabled) {
      return false;
    }
    if (entry) {
      // A request changing one record of its model, i.e. a create, is about that record
      const [first] = changes;
      const resourceId =
        entry.resourceId ??
        (changes.length === 1 && first.change.model === entry.model
          ? first.change.resourceId
          : undefined);
      return this.enqueue(
        this.toRow(auditId, { ...entry, resourceId }),
        changes.map(({ change }) => change)
      );
    }
    for (const { change, standalone } of changes) {
      this.enqueueChange(change, standalone);
    }
    return false;
  }

  /**
   * Writes the buffered entries to the database, in batches of `audit.batchSize`. A batch failing is buffered again
   * once, then dropped.
   *
   * @return {Promise<void>} A promise that resolves once the buffer is written.
   */
  public async flush(): Promise<void> {
    if (this._flushing) {
      return this._flushing;
    }
    this._flushing = this.writeBuffer().finally(() => {
      this._flushing = undefined;
    });
    return this._flushing;
  }

  /**
   * Deletes the entries older than the retention of their category, with their changes.
   *
   * @param {Date} [now] - The time the retentions count back from.
   * @return {Promise<number>} The number of entries deleted.
   */
  public async purge(now: Date = new Date()): Promise<number> {
    const client = this._db.client();
    let count = 0;
    for (const [retention, categories] of this.retentions()) {
      const before = new Date(now.getTime() - retention * 1000);
      for (;;) {
        const expired: { id: string }[] = await client.auditLog.findMany({
          where: { category: { in: categories }, createdAt: { lt: before } },
          select: { id: true },
          take: PURGE_BATCH_SIZE
        });
        if (expired.length === 0) {
          break;
        }
        const ids = expired.map(({ id }) => id);
        await client.$transaction([
          client.auditChange.deleteMany({ where: { auditLogId: { in: ids } } }),
          client.auditLog.deleteMany({ where: { id: { in: ids } } })
        ]);
        count += ids.length;
        if (expired.length < PURGE_BATCH_SIZE) {
          break;
        }
      }
    }
    if (count > 0) {
      logger.debug({ entries: count }, 'Expired audit log entries deleted');
    }
    return count;
  }

  /** @internal */
  private addChange(
    change: RecordChange,
    auditId: string | undefined,
    standalone: AuditEntry
  ): void {
    const open = auditId ? this._open.get(auditId) : undefined;
    if (open) {
      open.push({ change, standalone });
    } else {
      this.enqueueChange(change, standalone);
    }
  }

  /** @internal A change with an entry of its own. */
  private enqueueChange(change: RecordChange, standalone: AuditEntry): void {
    this.enqueue(this.toRow(uuidv7(), standalone), [change], true);
  }

  /** @internal The entry of a change recorded without the entry of its request. */
  private standaloneEntry(
    change: RecordChange,
    scope: RequestScope | undefined
  ): AuditEntry {
    return {
      category: 'change',
      source: scope?.source ?? 'system',
      action: scope?.action ?? change.action,
      model: change.model,
      resourceId: change.resourceId,
      ...this.callFields(scope)
    };
  }

  /** @internal The user, the client and the trace of the current call. */
  private callFields(scope: RequestScope | undefined): Partial<AuditEntry> {
    const user = currentAuthUser();
    const apiKey = currentApiKey<{ id?: ResourceId }>();
    return {
      userId: user?.id ?? scope?.userId ?? null,
      authType: currentAuthType() ?? null,
      apiKeyId: apiKey?.id ?? null,
      ip: scope?.ip,
      userAgent: scope?.userAgent,
      requestId: scope?.requestId,
      traceId: currentTraceId()
    };
  }

  /** @internal */
  private toRow(id: string, entry: AuditEntry): AuditLogRow {
    const scope = currentRequestScope();
    const fields = { ...this.callFields(scope), ...removeUndefined(entry) };
    const value = (data: unknown) =>
      data === undefined || data === null
        ? undefined
        : limit(
            redactSecrets(data, auditConfig.REDACT_KEYS),
            auditConfig.MAX_VALUE_SIZE
          );
    return removeUndefined({
      id,
      category: fields.category,
      source: fields.source ?? scope?.source ?? 'system',
      action: clip(fields.action, 255),
      method: clip(fields.method, 16),
      route: clip(fields.route, 1024),
      path: clip(fields.path, 2048),
      query: value(fields.query),
      body: value(fields.body),
      status: fields.status,
      errorCode: clip(fields.errorCode, 255),
      duration: fields.duration,
      userId: text(fields.userId, 255),
      authType: clip(fields.authType ?? undefined, 32),
      apiKeyId: text(fields.apiKeyId, 255),
      ip: clip(
        auditConfig.ANONYMIZE_IP && fields.ip
          ? anonymizeIp(fields.ip)
          : fields.ip,
        64
      ),
      userAgent: clip(fields.userAgent, 1024),
      requestId: clip(fields.requestId, 255),
      traceId: clip(fields.traceId, 64),
      model: clip(fields.model, 255),
      resourceId: text(fields.resourceId, 255),
      metadata: value(fields.metadata),
      createdAt: fields.createdAt ?? new Date()
    }) as AuditLogRow;
  }

  /** @internal A full buffer drops its oldest entries, keeping the recent history. */
  private enqueue(
    log: AuditLogRow,
    changes: RecordChange[],
    standalone = false
  ): boolean {
    while (this._buffer.length >= auditConfig.MAX_BUFFER) {
      this._buffer.shift();
      if (this._dropped++ === 0) {
        logger.warn(
          { maxBuffer: auditConfig.MAX_BUFFER },
          'The audit log buffer is full, the oldest entries are dropped'
        );
      }
      if (telemetryEnabled('audit')) {
        droppedEntries().add(1);
      }
    }
    this._buffer.push({ log, changes, standalone, attempts: 0 });
    if (this._buffer.length >= auditConfig.BATCH_SIZE) {
      void this.flush();
    }
    this.scheduleFlush();
    return true;
  }

  /**
   * Writes the buffer once `audit.flushInterval` has passed, rescheduled while entries are left, so an idle
   * application runs no timer.
   *
   * @internal
   */
  private scheduleFlush(): void {
    if (
      this._flushTimer ||
      this._flushInterval === undefined ||
      this._buffer.length === 0
    ) {
      return;
    }
    this._flushTimer = setTimeout(() => {
      this._flushTimer = undefined;
      void this.flush().finally(() => this.scheduleFlush());
    }, this._flushInterval);
    this._flushTimer.unref();
  }

  /** @internal */
  private async writeBuffer(): Promise<void> {
    while (this._buffer.length > 0) {
      const batch = this._buffer.splice(0, auditConfig.BATCH_SIZE);
      try {
        const rows = toBatch(batch);
        if (this._queue) {
          await this._queue.sendJob(rows);
        } else {
          await this.writeBatch(rows);
        }
      } catch (error) {
        const retried = batch.filter((entry) => entry.attempts++ === 0);
        logger.error(
          {
            error,
            entries: batch.length,
            dropped: batch.length - retried.length
          },
          'Cannot write the audit log entries'
        );
        this._buffer.unshift(...retried);
        // Retried with the next flush
        return;
      }
    }
    if (this._dropped > 0) {
      logger.warn(
        { dropped: this._dropped },
        'Audit log entries were dropped while the buffer was full'
      );
      this._dropped = 0;
    }
  }

  /**
   * Writes the rows of a batch in one transaction, directly or as the worker of the `audit` queue.
   *
   * @internal
   */
  private async writeBatch({ logs, changes }: AuditBatch): Promise<void> {
    if (logs.length === 0) {
      return;
    }
    const client = this._db.client();
    await client.$transaction([
      client.auditLog.createMany({ data: logs }),
      ...(changes.length > 0
        ? [client.auditChange.createMany({ data: changes })]
        : [])
    ]);
    if (telemetryEnabled('audit')) {
      writtenEntries().add(logs.length);
    }
  }

  /**
   * Sends the batches to the `audit` queue with `audit.writeVia: 'queue'`, written by the instances with
   * `audit.writeWorker`.
   *
   * @internal
   * @throws {ConfigurationError} `CONFIGURATION_INVALID` without a queue.
   */
  private startQueue(): void {
    if (auditConfig.WRITE_VIA !== 'queue' || this._queue) {
      return;
    }
    if (!isDefined(Queue)) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        "The audit log writes through the queue (audit.writeVia: 'queue'), but no queue provider is enabled"
      );
    }
    this._queue = inject(Queue).get<AuditBatch, void>('audit');
    if (auditConfig.WRITE_WORKER) {
      this._queue.addWorker((job) => this.writeBatch(job.data));
    }
  }

  /** @internal The categories of every retention, in seconds. */
  private retentions(): Map<number, AuditCategory[]> {
    const retentions = new Map<number, AuditCategory[]>();
    for (const category of CATEGORIES) {
      const duration =
        categoryConfig(category).RETENTION || auditConfig.RETENTION;
      if (!duration) {
        continue;
      }
      const retention = seconds(duration, `retention of ${category}`);
      retentions.set(retention, [
        ...(retentions.get(retention) ?? []),
        category
      ]);
    }
    return retentions;
  }

  /** @internal */
  private stopTimers(): void {
    clearTimeout(this._flushTimer);
    clearInterval(this._purgeTimer);
    this._flushTimer = undefined;
    this._purgeTimer = undefined;
    this._flushInterval = undefined;
  }
}

const CATEGORIES: AuditCategory[] = [
  'auth',
  'read',
  'write',
  'change',
  'custom'
];

/** The config section of a category. */
function categoryConfig(category: AuditCategory): {
  ENABLED: boolean;
  RETENTION: string;
} {
  switch (category) {
    case 'auth':
      return auditAuthConfig;
    case 'read':
      return auditReadConfig;
    case 'write':
      return auditWriteConfig;
    case 'change':
      return auditChangesConfig;
    case 'custom':
      return auditCustomConfig;
  }
}

function seconds(duration: string, name: string): number {
  const value = parseDuration(duration);
  if (!value) {
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      `Audit log ${name} '${duration}' is not a duration, i.e. 1h`
    );
  }
  return value;
}

function includes(names: string[], name: string): boolean {
  return names.some((value) => value.toLowerCase() === name.toLowerCase());
}

function clip(value: string | undefined | null, maxLength: number) {
  return value === undefined || value === null
    ? undefined
    : value.slice(0, maxLength);
}

function text(
  value: string | number | null | undefined,
  maxLength: number
): string | undefined {
  return value === undefined || value === null
    ? undefined
    : clip(String(value), maxLength);
}

/**
 * Builds the rows of the buffered entries, comparing the states of their records: a change that changed nothing (an
 * update of the same values) is left out, and so is the entry of its own it had.
 */
function toBatch(entries: BufferedEntry[]): AuditBatch {
  const options = {
    redactKeys: auditConfig.REDACT_KEYS,
    maxValueSize: auditConfig.MAX_VALUE_SIZE
  };
  const batch: AuditBatch = { logs: [], changes: [] };
  for (const entry of entries) {
    const changes: AuditChangeRow[] = [];
    for (const change of entry.changes) {
      const config = injectModel(change.model, false)?.config;
      const diff = config
        ? diffRecords(config, change.previous, change.current, options)
        : {};
      if (change.action === 'update' && Object.keys(diff).length === 0) {
        continue;
      }
      changes.push({
        auditLogId: entry.log.id,
        model: change.model,
        resourceId: change.resourceId,
        action: change.action,
        diff: diff as Prisma.InputJsonValue,
        createdAt: change.createdAt
      });
    }
    if (entry.standalone && changes.length === 0) {
      continue;
    }
    batch.logs.push(entry.log);
    batch.changes.push(...changes);
  }
  return batch;
}
