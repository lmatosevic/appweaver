export type QueryResponse<T> = {
  /** Number of items returned on this page */
  resultCount: number;
  /** Total number of matching items */
  totalCount: number;
  /** Paginated result items */
  items: T[];
};

export type AggregateFunction = {
  /** Count of records */
  count?: number;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Average value */
  avg?: number;
  /** Sum of values */
  sum?: number;
  /** First value in range */
  first?: number;
  /** Last value in range */
  last?: number;
};

export type AggregateSelect<T> = Record<
  keyof T,
  Record<keyof AggregateFunction, boolean>
>;

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
    sort: string
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
