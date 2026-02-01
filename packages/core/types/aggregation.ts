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
