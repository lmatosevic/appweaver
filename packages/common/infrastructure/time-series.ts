import {
  HealthCheckConfig,
  HealthCheckResult,
  IHealthCheck,
  OnDestroy,
  OnInit
} from '../interfaces';
import { HEALTH_CHECK, LIFECYCLE } from '../constants';
import {
  SeriesDeleteQuery,
  SeriesModel,
  SeriesPoint,
  SeriesQuery
} from '../types/series';

/**
 * A store of the time series of the resource models: the points of the `series` fields of a model, each belonging to
 * a resource and keyed by its time. A point written at the time of a stored one merges into it, so a write can be
 * retried.
 */
export abstract class TimeSeries implements IHealthCheck, OnInit, OnDestroy {
  static [LIFECYCLE] = true;
  static [HEALTH_CHECK] = true;

  /** Whether the store deletes the points of a resource deleted from the database by itself, i.e. by a foreign key. */
  public readonly cascadesDeletes: boolean = false;

  /** Whether the store deletes points. */
  public readonly supportsDelete: boolean = true;

  /** Whether the store writes over the connection of the database, so a write takes part in its transactions. */
  public readonly transactional: boolean = false;

  abstract onInit(): Promise<void>;

  abstract onDestroy(): Promise<void>;

  /**
   * Prepares the store for the series of the models, i.e. creates their tables. Called once the models are loaded,
   * before any point is written.
   *
   * @param {SeriesModel[]} models - The models with series fields.
   */
  abstract register(models: SeriesModel[]): Promise<void>;

  /**
   * Writes the points of a model, merging a point into the one stored at the same time.
   *
   * @param {SeriesModel} model - The series model.
   * @param {SeriesPoint[]} points - The points to write.
   * @return {Promise<number>} The number of points written.
   */
  abstract write(model: SeriesModel, points: SeriesPoint[]): Promise<number>;

  /**
   * Queries the points of a model, aggregated by bucket when the query has a bucket or an aggregate. The values of
   * the fields a point does not carry are null.
   *
   * @param {SeriesModel} model - The series model.
   * @param {SeriesQuery} query - The query.
   * @return {Promise<SeriesPoint[]>} The points, ordered by their time and resource id.
   */
  abstract query(
    model: SeriesModel,
    query: SeriesQuery
  ): Promise<SeriesPoint[]>;

  /**
   * Deletes the points of a model within a time range.
   *
   * @param {SeriesModel} model - The series model.
   * @param {SeriesDeleteQuery} query - The resources and the time range.
   * @return {Promise<number>} The number of points deleted.
   */
  abstract delete(
    model: SeriesModel,
    query: SeriesDeleteQuery
  ): Promise<number>;

  abstract checkHealth(): Promise<HealthCheckResult>;

  public checkHealthConfig(): HealthCheckConfig {
    return { name: 'timeseries' };
  }
}
