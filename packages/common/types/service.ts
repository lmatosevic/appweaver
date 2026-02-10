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

export type HookResponse = void | Promise<void>;

export type ResourceServiceConfig = {
  name: string;
  beforeFind?: (id: number) => HookResponse;
  beforeQuery?: (
    filter: any,
    page: number,
    size: number,
    sort: string
  ) => HookResponse;
  beforeAggregate?: (
    filter: any,
    select: AggregateSelect<any>,
    dateField: string,
    from?: string,
    to?: string,
    step?: number,
    safeIncrement?: boolean
  ) => HookResponse;
  beforeCreate?: (data: any) => HookResponse;
  beforeUpdate?: (id: number, data: any) => HookResponse;
  beforeDelete?: (id: number) => HookResponse;
  afterFind?: (resource: any) => HookResponse;
  afterQuery?: (response: QueryResponse<any>) => HookResponse;
  afterAggregate?: (response: AggregateResponse<any>) => HookResponse;
  afterCreate?: (resource: any) => HookResponse;
  afterUpdate?: (resource: any) => HookResponse;
  afterDelete?: (resource: any) => HookResponse;
  textSearch?: any | ((input: string) => any);
};
