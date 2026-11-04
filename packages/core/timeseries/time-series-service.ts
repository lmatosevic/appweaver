import {
  createLogger,
  ErrorCode,
  hasSeries,
  isAppweaverError,
  LIFECYCLE,
  ModelName,
  OnReady,
  parseDuration,
  Queue,
  QueueJob,
  QueueProcessor,
  RegistryType,
  ResourceId,
  SeriesAggregate,
  SeriesIngest,
  SeriesModel,
  seriesModelOf,
  SeriesPoint,
  SeriesQuery,
  SeriesValue,
  TimeSeries,
  TimeSeriesError
} from '@appweaver/common';
import { context, inject } from '../context';
import { MemoryQueue } from '../queue/memory-queue';
import { timeseriesConfig } from './timeseries-config';

const logger = createLogger('timeseries');

const AGGREGATES: SeriesAggregate[] = [
  'avg',
  'min',
  'max',
  'sum',
  'count',
  'first',
  'last'
];

/** The values of the series fields of a model, typed by the registered model once the types are generated. */
export type SeriesValues<N extends string> = RegistryType<
  N,
  'series',
  Record<string, SeriesValue>
>;

/** A point to write: its resource, its time (now by default) and its values. */
export type SeriesPointInput<V = Record<string, SeriesValue>> = {
  /** The id of the resource the point belongs to */
  resourceId: ResourceId;
  /** The time of the point: a date, an ISO 8601 string or the milliseconds since the epoch (default: now) */
  time?: Date | string | number;
  /** The values of the series fields */
  values: Partial<V>;
};

/** A query of the points of one or more resources, its times and bucket in any accepted form. */
export type SeriesQueryInput = Omit<SeriesQuery, 'from' | 'to' | 'bucket'> & {
  /** The start of the time range, inclusive: a date, an ISO 8601 string or the milliseconds since the epoch */
  from?: Date | string | number;
  /** The end of the time range, exclusive */
  to?: Date | string | number;
  /** The bucket width, a duration (`15m`, `1h`, `1d`) or a number of seconds */
  bucket?: string | number;
};

/** The resources and the time range of the points to delete. */
export type SeriesDeleteInput = {
  /** The resources whose points are deleted */
  resourceIds: ResourceId[];
  /** The start of the time range, inclusive */
  from?: Date | string | number;
  /** The end of the time range, exclusive */
  to?: Date | string | number;
};

export type SeriesWriteOptions = {
  /** How the points are written, overriding the one of the model (see `seriesOptions.ingest`) */
  ingest?: SeriesIngest;
  /** The maximum number of points accepted (default: the `timeseries.maxPointsPerWrite` config) */
  maxPoints?: number;
};

export type SeriesWriteResult = {
  /** The number of points written, or queued */
  count: number;
  /** Whether the points were sent to the queue, so a worker writes them later */
  queued: boolean;
};

/** The data of a queue job writing points. */
type SeriesJob = {
  model: string;
  points: {
    resourceId: ResourceId;
    time: string | Date;
    values: Partial<Record<string, SeriesValue>>;
  }[];
};

/**
 * Validates, writes and queries the points of the `series` fields of the resource models, in the `TimeSeries` store
 * selected by `timeseries.provider`. A write is applied directly or sent to the queue, so a worker writes it (see
 * `timeseries.ingest`), and either way the points are validated first, so an invalid write fails at once.
 */
export class TimeSeriesService implements OnReady {
  static [LIFECYCLE] = true;

  /** @internal */
  private readonly _store = inject(TimeSeries);
  /** @internal */
  private _registered?: Promise<void>;
  /** @internal */
  private _workerStarted = false;

  /** Registers the series of the models with the store, and starts the worker of the queued points. */
  public async onReady(): Promise<void> {
    await this.ensureRegistered();
    this.startWorker();
  }

  /**
   * Returns the series of every model declaring `series` fields.
   *
   * @return {SeriesModel[]} The series models.
   */
  public models(): SeriesModel[] {
    return [...context.resource.models.values()]
      .filter((model) => hasSeries(model.config))
      .map((model) => seriesModelOf(model));
  }

  /**
   * Returns the series of a model.
   *
   * @param {string} modelName - The model name.
   * @return {SeriesModel} The series model.
   * @throws {TimeSeriesError} `TIMESERIES_NOT_ENABLED` for a model without `series` fields.
   */
  public model(modelName: string): SeriesModel {
    const model = context.resource.models.get(modelName);
    if (!model || !hasSeries(model.config)) {
      throw new TimeSeriesError(
        ErrorCode.TimeSeriesNotEnabled,
        `${modelName} has no time series fields`,
        { model: modelName }
      );
    }
    return seriesModelOf(model);
  }

  /**
   * Resolves how the points of a model are written, `queue` only when a queue is provided.
   *
   * @param {string} modelName - The model name.
   * @param {SeriesIngest} [ingest] - The ingest mode overriding the one of the model.
   * @return {'direct' | 'queue'} The resolved ingest mode.
   */
  public ingestOf(
    modelName: string,
    ingest?: SeriesIngest
  ): 'direct' | 'queue' {
    const mode =
      ingest ?? this.model(modelName).options.ingest ?? timeseriesConfig.INGEST;
    if (mode === 'direct') {
      return 'direct';
    }

    const queue = inject(Queue, false);
    if (!queue) {
      if (mode === 'queue') {
        logger.warn(
          { model: modelName },
          'No queue is provided for the queued time series points, they are written directly'
        );
      }
      return 'direct';
    }

    return mode === 'auto' && queue instanceof MemoryQueue ? 'direct' : 'queue';
  }

  /**
   * Validates the points of a model, then writes them, or sends them to the queue for a worker to write.
   *
   * @param {string} modelName - The model name.
   * @param {SeriesPointInput[]} points - The points.
   * @param {SeriesWriteOptions} [options] - The ingest mode and the maximum number of points.
   * @return {Promise<SeriesWriteResult>} The number of points and whether they were queued.
   * @throws {TimeSeriesError} For a model without series, too many points, or an invalid point.
   */
  public async write<N extends ModelName>(
    modelName: N,
    points: SeriesPointInput<SeriesValues<N>>[],
    options: SeriesWriteOptions = {}
  ): Promise<SeriesWriteResult> {
    const model = this.model(modelName);
    const normalized = this.normalizePoints(model, points, options.maxPoints);
    if (normalized.length === 0) {
      return { count: 0, queued: false };
    }

    if (this.ingestOf(modelName, options.ingest) === 'queue') {
      await this.enqueue(model, normalized);
      return { count: normalized.length, queued: true };
    }

    await this.ensureRegistered();
    await this._store.write(model, normalized);
    return { count: normalized.length, queued: false };
  }

  /**
   * Queries the points of a model.
   *
   * @param {string} modelName - The model name.
   * @param {SeriesQueryInput} query - The query.
   * @return {Promise<SeriesPoint[]>} The points, ordered by their time.
   * @throws {TimeSeriesError} For a model without series, an unknown field, an invalid range or bucket.
   */
  public async query<N extends ModelName>(
    modelName: N,
    query: SeriesQueryInput
  ): Promise<SeriesPoint<SeriesValues<N>>[]> {
    const model = this.model(modelName);
    const normalized = this.normalizeQuery(model, query);
    if (normalized.resourceIds.length === 0) {
      return [];
    }

    await this.ensureRegistered();
    return (await this._store.query(model, normalized)) as SeriesPoint<
      SeriesValues<N>
    >[];
  }

  /**
   * Deletes the points of a model within a time range, all of them without one.
   *
   * @param {string} modelName - The model name.
   * @param {SeriesDeleteInput} query - The resources and the time range.
   * @return {Promise<number>} The number of points deleted.
   * @throws {TimeSeriesError} `TIMESERIES_UNSUPPORTED` when the store does not delete points.
   */
  public async delete(
    modelName: string,
    query: SeriesDeleteInput
  ): Promise<number> {
    const model = this.model(modelName);
    if (!this._store.supportsDelete) {
      throw new TimeSeriesError(
        ErrorCode.TimeSeriesUnsupported,
        `The ${this._store.constructor.name} time series store does not delete points`,
        { operation: 'delete', provider: this._store.constructor.name }
      );
    }

    const from = parseTime(query.from);
    const to = parseTime(query.to);
    checkRange(from, to);
    if (query.resourceIds.length === 0) {
      return 0;
    }

    await this.ensureRegistered();
    return this._store.delete(model, {
      resourceIds: this.resourceIds(model, query.resourceIds),
      from,
      to
    });
  }

  /**
   * Deletes the points of deleted resources, unless the store deletes them by itself (a foreign key) or deletes no
   * points. Called by the resource services once the resources are deleted.
   *
   * @param {string} modelName - The model name.
   * @param {ResourceId[]} resourceIds - The ids of the deleted resources.
   */
  public async purgeResources(
    modelName: string,
    resourceIds: ResourceId[]
  ): Promise<void> {
    const model = context.resource.models.get(modelName);
    if (
      !model ||
      !hasSeries(model.config) ||
      resourceIds.length === 0 ||
      this._store.cascadesDeletes ||
      !this._store.supportsDelete
    ) {
      return;
    }

    try {
      await this._store.delete(seriesModelOf(model), { resourceIds });
    } catch (error) {
      logger.error(
        { err: error, model: modelName, resourceIds },
        'Cannot delete the time series points of the deleted resources'
      );
    }
  }

  /**
   * Validates and normalizes the points of a model, merging the points of a resource at the same time.
   *
   * @param {SeriesModel} model - The series model.
   * @param {SeriesPointInput[]} points - The points.
   * @param {number} [maxPoints] - The maximum number of points (default: the `timeseries.maxPointsPerWrite` config).
   * @return {SeriesPoint[]} The normalized points.
   * @throws {TimeSeriesError} For too many points, or an invalid point.
   */
  public normalizePoints(
    model: SeriesModel,
    points: SeriesPointInput[],
    maxPoints: number = timeseriesConfig.MAX_POINTS_PER_WRITE
  ): SeriesPoint[] {
    if (points.length > maxPoints) {
      throw new TimeSeriesError(
        ErrorCode.TimeSeriesTooManyPoints,
        `A write accepts up to ${maxPoints} points`,
        { maxPoints }
      );
    }

    const merged = new Map<string, SeriesPoint>();
    const now = new Date();

    for (const point of points) {
      const time = parseTime(point.time) ?? now;
      const values: Record<string, SeriesValue> = {};

      for (const [field, value] of Object.entries(point.values ?? {})) {
        const config = model.fields[field];
        if (!config) {
          throw new TimeSeriesError(
            ErrorCode.TimeSeriesInvalidField,
            `${model.name} has no time series field '${field}'`,
            { model: model.name, field }
          );
        }
        if (value === null || value === undefined) {
          continue;
        }

        const reason = invalidValueReason(config.type, value, config);
        if (reason) {
          throw new TimeSeriesError(
            ErrorCode.TimeSeriesInvalidValue,
            `The value of '${model.name}.${field}' ${reason}`,
            { model: model.name, field, reason }
          );
        }
        values[field] = value;
      }

      if (Object.keys(values).length === 0) {
        throw new TimeSeriesError(
          ErrorCode.TimeSeriesInvalidValue,
          `A point of ${model.name} carries no value`,
          { model: model.name, field: '*', reason: 'is missing' }
        );
      }

      const resourceId = this.resourceIds(model, [point.resourceId])[0];
      const key = `${resourceId}|${time.getTime()}`;
      const existing = merged.get(key);
      merged.set(key, {
        resourceId,
        time,
        values: { ...existing?.values, ...values }
      });
    }

    return [...merged.values()];
  }

  /**
   * Validates and normalizes a query of a model.
   *
   * @param {SeriesModel} model - The series model.
   * @param {SeriesQueryInput} query - The query.
   * @return {SeriesQuery} The normalized query, its limit within the `timeseries.maxPointsPerQuery` config.
   * @throws {TimeSeriesError} For an unknown field, an invalid range, bucket or aggregate, or too many resources.
   */
  public normalizeQuery(
    model: SeriesModel,
    query: SeriesQueryInput
  ): SeriesQuery {
    const maxResources = timeseriesConfig.MAX_RESOURCES_PER_QUERY;
    if (query.resourceIds.length > maxResources) {
      throw new TimeSeriesError(
        ErrorCode.TimeSeriesTooManyResources,
        `A time series query covers up to ${maxResources} resources`,
        { maxResources }
      );
    }

    for (const field of query.fields ?? []) {
      if (!model.fields[field]) {
        throw new TimeSeriesError(
          ErrorCode.TimeSeriesInvalidField,
          `${model.name} has no time series field '${field}'`,
          { model: model.name, field }
        );
      }
    }

    const from = parseTime(query.from);
    const to = parseTime(query.to);
    checkRange(from, to);

    let bucket: number | undefined;
    if (query.bucket !== undefined && query.bucket !== '') {
      bucket = parseDuration(query.bucket);
      if (!bucket || bucket < 1 || !Number.isInteger(bucket)) {
        throw new TimeSeriesError(
          ErrorCode.TimeSeriesInvalidBucket,
          `The bucket '${query.bucket}' is not a duration of whole seconds, i.e. 15m, 1h or 1d`,
          { bucket: String(query.bucket) }
        );
      }
    }

    if (query.aggregate && !AGGREGATES.includes(query.aggregate)) {
      throw new TimeSeriesError(
        ErrorCode.TimeSeriesInvalidAggregate,
        `The aggregate '${query.aggregate}' is not one of ${AGGREGATES.join(', ')}`,
        { aggregate: String(query.aggregate) }
      );
    }

    const maxPoints = timeseriesConfig.MAX_POINTS_PER_QUERY;
    return {
      resourceIds: this.resourceIds(model, query.resourceIds),
      fields: query.fields?.length
        ? [...new Set(query.fields)]
        : Object.keys(model.fields),
      from,
      to,
      bucket,
      aggregate: bucket ? (query.aggregate ?? 'avg') : query.aggregate,
      order: query.order === 'desc' ? 'desc' : 'asc',
      limit: Math.min(query.limit ?? maxPoints, maxPoints)
    };
  }

  /** Registers the series of the models with the store once. @internal */
  private ensureRegistered(): Promise<void> {
    this._registered ??= this._store.register(this.models()).catch((error) => {
      this._registered = undefined;
      throw error;
    });
    return this._registered;
  }

  /** The processor of the queue the points are sent to. @internal */
  private processor(): QueueProcessor<SeriesJob, number> {
    return inject(Queue).get<SeriesJob, number>(timeseriesConfig.QUEUE_NAME);
  }

  /** Sends the points to the queue, in jobs of up to `timeseries.queueBatchSize` points. @internal */
  private async enqueue(
    model: SeriesModel,
    points: SeriesPoint[]
  ): Promise<void> {
    const size = timeseriesConfig.QUEUE_BATCH_SIZE;
    const jobs: { data: SeriesJob; name: string }[] = [];
    for (let i = 0; i < points.length; i += size) {
      jobs.push({
        name: model.name,
        data: {
          model: model.name,
          points: points.slice(i, i + size).map((point) => ({
            resourceId: point.resourceId,
            time: point.time.toISOString(),
            values: point.values
          }))
        }
      });
    }
    await this.processor().sendBulkJobs(jobs);
  }

  /** Starts the worker writing the queued points, when a model queues its points. @internal */
  private startWorker(): void {
    if (this._workerStarted || !timeseriesConfig.QUEUE_WORKER) {
      return;
    }

    const queued = this.models().some(
      (model) => this.ingestOf(model.name) === 'queue'
    );
    if (!queued) {
      return;
    }

    this._workerStarted = true;
    this.processor().addWorker((job) => this.processJob(job), {
      concurrency: timeseriesConfig.QUEUE_CONCURRENCY
    });
    logger.debug(
      { queue: timeseriesConfig.QUEUE_NAME },
      'Time series worker started'
    );
  }

  /**
   * Writes the points of a queue job. The points of a resource deleted since they were queued are dropped, any other
   * error fails the job, which the queue retries.
   *
   * @internal
   */
  private async processJob(job: QueueJob<SeriesJob, number>): Promise<number> {
    const model = this.model(job.data.model);
    const points: SeriesPoint[] = job.data.points.map((point) => ({
      resourceId: point.resourceId,
      time: new Date(point.time),
      values: point.values
    }));

    await this.ensureRegistered();
    try {
      return await this._store.write(model, points);
    } catch (error) {
      if (!isForeignKeyViolation(error)) {
        throw error;
      }
    }

    // One of the resources is deleted, so the points are written by resource, dropping those of the deleted ones
    let written = 0;
    for (const group of Map.groupBy(points, (point) =>
      String(point.resourceId)
    ).values()) {
      try {
        written += await this._store.write(model, group);
      } catch (error) {
        if (!isForeignKeyViolation(error)) {
          throw error;
        }
        logger.warn(
          {
            model: model.name,
            resourceId: group[0].resourceId,
            points: group.length
          },
          'Dropped the queued time series points of a deleted resource'
        );
      }
    }
    return written;
  }

  /** Converts the ids to the type of the primary key of the model. @internal */
  private resourceIds(model: SeriesModel, ids: ResourceId[]): ResourceId[] {
    return ids.map((id) => {
      if (model.idType === 'string') {
        return String(id);
      }
      const value = Number(id);
      return Number.isNaN(value) ? id : value;
    });
  }
}

/** Parses the time of a point or a range. */
function parseTime(value?: Date | string | number): Date | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const time = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(time.getTime())) {
    throw new TimeSeriesError(
      ErrorCode.TimeSeriesInvalidTime,
      `'${String(value)}' is not a valid time`,
      { time: String(value) }
    );
  }
  return time;
}

function checkRange(from?: Date, to?: Date): void {
  if (from && to && from.getTime() >= to.getTime()) {
    throw new TimeSeriesError(
      ErrorCode.TimeSeriesInvalidRange,
      'The start of the time range must be before its end',
      { from: from.toISOString(), to: to.toISOString() }
    );
  }
}

/** The reason a value does not fit its field, or undefined for a valid one. */
function invalidValueReason(
  type: 'float' | 'int' | 'boolean',
  value: unknown,
  range: { minimum?: number; maximum?: number }
): string | undefined {
  if (type === 'boolean') {
    return typeof value === 'boolean' ? undefined : 'must be a boolean';
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'must be a finite number';
  }
  if (type === 'int' && !Number.isInteger(value)) {
    return 'must be an integer';
  }
  if (range.minimum !== undefined && value < range.minimum) {
    return `must be >= ${range.minimum}`;
  }
  if (range.maximum !== undefined && value > range.maximum) {
    return `must be <= ${range.maximum}`;
  }
  return undefined;
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    isAppweaverError(error) && error.is(ErrorCode.DatabaseForeignKeyViolation)
  );
}
