import { SeriesField, SeriesOptions } from './model';
import { ResourceId } from './resource-id';

/** The value of a series field: a number, a boolean, or null for a field the point leaves out. */
export type SeriesValue = number | boolean | null;

/** The function aggregating the values of a field within a bucket. */
export type SeriesAggregate =
  | 'avg'
  | 'min'
  | 'max'
  | 'sum'
  | 'count'
  | 'first'
  | 'last';

/** The order of the points by their time. */
export type SeriesOrder = 'asc' | 'desc';

/** A point of the series of a resource: its time and the values of the fields it carries. */
export type SeriesPoint<
  V extends Record<string, SeriesValue> = Record<string, SeriesValue>
> = {
  /** The id of the resource the point belongs to */
  resourceId: ResourceId;
  /** The time of the point, unique per resource: a point written at the same time merges into it */
  time: Date;
  /** The values of the fields, the left out ones keep the value already stored at the same time */
  values: Partial<V>;
};

/** A query of the points of one or more resources. */
export type SeriesQuery = {
  /** The resources to query */
  resourceIds: ResourceId[];
  /** The fields to return, every field by default */
  fields?: string[];
  /** The start of the time range, inclusive */
  from?: Date;
  /** The end of the time range, exclusive */
  to?: Date;
  /** The bucket width in seconds, aggregating the points of each bucket into one, aligned to the Unix epoch */
  bucket?: number;
  /** The function aggregating the points of a bucket, or of the whole range without a bucket */
  aggregate?: SeriesAggregate;
  /** The order of the points by their time (default: `asc`) */
  order?: SeriesOrder;
  /** The maximum number of points returned */
  limit?: number;
};

/** The points of one or more resources to delete, within a time range. */
export type SeriesDeleteQuery = {
  /** The resources whose points are deleted */
  resourceIds: ResourceId[];
  /** The start of the time range, inclusive */
  from?: Date;
  /** The end of the time range, exclusive */
  to?: Date;
};

/** The series of a resource model, as a time series store receives it. */
export type SeriesModel = {
  /** The name of the resource model, i.e. `Sensor` */
  name: string;
  /** The name of the table holding the points, i.e. `SensorSeries` */
  table: string;
  /** The type of the resource id, which the store converts the ids it reads back to */
  idType: 'int' | 'bigInt' | 'string';
  /** The series fields */
  fields: Record<string, SeriesField>;
  /** The series options */
  options: SeriesOptions;
};
