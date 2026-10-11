import { AggregateResponse, AggregateSelect } from './aggregate';
import { QuerySort } from './sort';
import { ResourceId } from './resource';
import { ModelName } from './registry';

export type QueryResponse<T> = {
  /** Number of items returned on this page */
  resultCount: number;
  /** Total number of matching items, null when the query opted out of counting */
  totalCount: number | null;
  /** Cursor fetching the page after this one, null on the last page */
  nextCursor: string | null;
  /** Cursor fetching the page before this one, null on the first page */
  prevCursor: string | null;
  /** Paginated result items */
  items: T[];
};

/** The options of a resource query. */
export type QueryOptions<T = any, Q = any> = {
  /** The query filter, typed by `QueryFilter` */
  filter?: Q;
  /** The one-based page number, ignored when a cursor is given (default: `1`) */
  page?: number;
  /** The maximum number of results per page (default: `50`) */
  size?: number;
  /** The fields to sort by (default: `-createdAt`) */
  sort?: QuerySort<T>;
  /** The cursor of the page to return, as issued in an earlier response. Takes precedence over `page` */
  cursor?: string | null;
  /** Whether to count all matching resources (default: `true`) */
  totalCount?: boolean;
};

/** The options of a resource aggregation. */
export type AggregateOptions<T = any, S = AggregateSelect<T>, Q = any> = {
  /** The aggregation operations to perform per field */
  select: S;
  /** The query filter, typed by `QueryFilter` */
  filter?: Q;
  /** The date field the range is applied on (default: `createdAt`) */
  dateField?: string;
  /** The ISO date string of the range start (default: seven days before the range end) */
  from?: string;
  /** The ISO date string of the range end (default: now) */
  to?: string;
  /** The size of a single period in units of the automatically selected time unit */
  step?: number;
  /** Whether the period increments stay consistent across daylight saving time changes (default: `true`) */
  safeIncrement?: boolean;
};

/** An item of a bulk update or replacement: the id of the resource and its data. */
export type BulkItem<T> = {
  /** The id of the resource */
  id: ResourceId;
  /** The data to update or replace the resource with */
  data: T;
};

/** The response of a bulk route not returning the records, which either applies every item or none. */
export type BulkResponse = {
  /** Whether every item was applied, always true, since a failed bulk responds with an error */
  success: boolean;
  /** The number of resources created, updated, or deleted */
  count: number;
};

export type ServiceHookResponse = void | Promise<void>;

export type ResourceServiceConfig<T = any, C = any, U = any> = {
  /** Resource model name */
  modelName: ModelName;
  /** Hook called before fetching a single resource */
  beforeFind?: (id: ResourceId) => ServiceHookResponse;
  /** Hook called before a list query, with the query options it may change */
  beforeQuery?: (options: QueryOptions<T>) => ServiceHookResponse;
  /** Hook called before an aggregate query, with the aggregation options it may change */
  beforeAggregate?: (
    options: AggregateOptions<T, AggregateSelect<T>>
  ) => ServiceHookResponse;
  /** Hook called before creating a resource */
  beforeCreate?: (data: C) => ServiceHookResponse;
  /** Hook called before updating or replacing a resource */
  beforeUpdate?: (id: ResourceId, data: U) => ServiceHookResponse;
  /** Hook called before deleting a resource */
  beforeDelete?: (id: ResourceId) => ServiceHookResponse;
  /** Hook called after fetching a single resource */
  afterFind?: (resource: T) => ServiceHookResponse;
  /** Hook called after a list query */
  afterQuery?: (response: QueryResponse<T>) => ServiceHookResponse;
  /** Hook called after an aggregate query */
  afterAggregate?: (response: AggregateResponse<T>) => ServiceHookResponse;
  /** Hook called after creating a resource */
  afterCreate?: (resource: T) => ServiceHookResponse;
  /** Hook called after updating or replacing a resource, with the state it had before the update */
  afterUpdate?: (resource: T, previous: T) => ServiceHookResponse;
  /** Hook called after deleting a resource */
  afterDelete?: (resource: T) => ServiceHookResponse;
  /** Prisma filter or factory for full-text search */
  textSearch?: any | ((input: string) => any);
};
