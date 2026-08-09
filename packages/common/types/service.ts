import { QuerySort } from './sort';

export type QueryResponse<T> = {
  /** Number of items returned on this page */
  resultCount: number;
  /** Total number of matching items */
  totalCount: number;
  /** Paginated result items */
  items: T[];
};

/**
 * The values a single aggregated field holds in a response. The date values are
 * ISO date strings, and every operator but `count` is null when no record
 * matched the aggregated range.
 */
export type AggregateFunction = {
  /** Count of records with a non-null value */
  count?: number;
  /** Minimum value, an ISO date string for a date field */
  min?: number | string | null;
  /** Maximum value, an ISO date string for a date field */
  max?: number | string | null;
  /** Average value, numeric fields only */
  avg?: number | null;
  /** Sum of values, numeric fields only */
  sum?: number | null;
  /** Value held by the earliest record of the range, ordered by its date field */
  first?: number | string | null;
  /** Value held by the latest record of the range, ordered by its date field */
  last?: number | string | null;
};

/** The aggregation operators applicable to a numeric field. */
export type NumericAggregateSelect = {
  /** Count the records with a non-null value */
  count?: boolean;
  /** Sum the values */
  sum?: boolean;
  /** Average the values */
  avg?: boolean;
  /** Take the lowest value */
  min?: boolean;
  /** Take the highest value */
  max?: boolean;
  /** Take the value of the earliest record of the range */
  first?: boolean;
  /** Take the value of the latest record of the range */
  last?: boolean;
};

/** The aggregation operators applicable to a date field. */
export type DateAggregateSelect = Pick<
  NumericAggregateSelect,
  'count' | 'min' | 'max' | 'first' | 'last'
>;

/**
 * The aggregation operations to perform per field of a resource model. Only the
 * numeric and the date fields can be aggregated, the numeric ones by every
 * operator and the date ones by `count`, `min` and `max`.
 *
 * @example
 * const select: AggregateSelect<Post> = {
 *   views: { sum: true, avg: true },
 *   publishedAt: { min: true, max: true }
 * };
 */
export type AggregateSelect<T = any> = {
  [K in keyof T as NonNullable<T[K]> extends number
    ? K
    : never]?: NumericAggregateSelect;
} & {
  [K in keyof T as NonNullable<T[K]> extends Date
    ? K
    : never]?: DateAggregateSelect;
};

export type AggregateValue<T> = Partial<Record<keyof T, AggregateFunction>>;

export type AggregateResult<T> = {
  /** Date bucket for this aggregation step */
  date: Date;
  /** Aggregated values for this step */
  result: AggregateValue<T>;
};

export type AggregateResponse<T> = {
  /** Aggregated totals across the full range */
  total: AggregateValue<T>;
  /** Per-step aggregation results */
  items: AggregateResult<T>[];
};

export type PeriodIncrementFn = (date: Date, amount: number) => Date;

export type ServiceHookResponse = void | Promise<void>;

export type ResourceServiceConfig<T = any, C = any, U = any> = {
  /** Resource model name */
  modelName: string;
  /** Hook called before fetching a single resource */
  beforeFind?: (id: number) => ServiceHookResponse;
  /** Hook called before a list query */
  beforeQuery?: (
    filter: any,
    page: number,
    size: number,
    sort: QuerySort<T>
  ) => ServiceHookResponse;
  /** Hook called before an aggregate query */
  beforeAggregate?: (
    filter: any,
    select: AggregateSelect<T>,
    dateField: string,
    from?: string,
    to?: string,
    step?: number,
    safeIncrement?: boolean
  ) => ServiceHookResponse;
  /** Hook called before creating a resource */
  beforeCreate?: (data: C) => ServiceHookResponse;
  /** Hook called before updating a resource */
  beforeUpdate?: (id: number, data: U) => ServiceHookResponse;
  /** Hook called before deleting a resource */
  beforeDelete?: (id: number) => ServiceHookResponse;
  /** Hook called after fetching a single resource */
  afterFind?: (resource: T) => ServiceHookResponse;
  /** Hook called after a list query */
  afterQuery?: (response: QueryResponse<T>) => ServiceHookResponse;
  /** Hook called after an aggregate query */
  afterAggregate?: (response: AggregateResponse<T>) => ServiceHookResponse;
  /** Hook called after creating a resource */
  afterCreate?: (resource: T) => ServiceHookResponse;
  /** Hook called after updating a resource */
  afterUpdate?: (resource: T) => ServiceHookResponse;
  /** Hook called after deleting a resource */
  afterDelete?: (resource: T) => ServiceHookResponse;
  /** Prisma filter or factory for full-text search */
  textSearch?: any | ((input: string) => any);
};
