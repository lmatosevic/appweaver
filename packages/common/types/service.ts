export type QueryResponse<T> = {
  resultCount: number;
  totalCount: number;
  items: T[];
};

export type AggregateFunction = {
  count?: number;
  min?: number;
  max?: number;
  avg?: number;
  sum?: number;
  first?: number;
  last?: number;
};

export type AggregateSelect<T> = Record<
  keyof T,
  Record<keyof AggregateFunction, boolean>
>;

export type AggregateValue<T> = Partial<Record<keyof T, AggregateFunction>>;

export type AggregateResult<T> = {
  date: Date;
  result: AggregateValue<T>;
};

export type AggregateResponse<T> = {
  total: AggregateValue<T>;
  items: AggregateResult<T>[];
};

export type PeriodIncrementFn = (date: Date, amount: number) => Date;

export type ServiceHookResponse = void | Promise<void>;

export type ResourceServiceConfig = {
  modelName: string;
  beforeFind?: (id: number) => ServiceHookResponse;
  beforeQuery?: (
    filter: any,
    page: number,
    size: number,
    sort: string
  ) => ServiceHookResponse;
  beforeAggregate?: (
    filter: any,
    select: AggregateSelect<any>,
    dateField: string,
    from?: string,
    to?: string,
    step?: number,
    safeIncrement?: boolean
  ) => ServiceHookResponse;
  beforeCreate?: (data: any) => ServiceHookResponse;
  beforeUpdate?: (id: number, data: any) => ServiceHookResponse;
  beforeDelete?: (id: number) => ServiceHookResponse;
  afterFind?: (resource: any) => ServiceHookResponse;
  afterQuery?: (response: QueryResponse<any>) => ServiceHookResponse;
  afterAggregate?: (response: AggregateResponse<any>) => ServiceHookResponse;
  afterCreate?: (resource: any) => ServiceHookResponse;
  afterUpdate?: (resource: any) => ServiceHookResponse;
  afterDelete?: (resource: any) => ServiceHookResponse;
  textSearch?: any | ((input: string) => any);
};
