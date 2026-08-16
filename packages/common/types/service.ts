import { AggregateResponse, AggregateSelect } from './aggregate';
import { QuerySort } from './sort';
import { ResourceId } from './resource';

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

export type ServiceHookResponse = void | Promise<void>;

export type ResourceServiceConfig<T = any, C = any, U = any> = {
  /** Resource model name */
  modelName: string;
  /** Hook called before fetching a single resource */
  beforeFind?: (id: ResourceId) => ServiceHookResponse;
  /** Hook called before a list query */
  beforeQuery?: (
    filter: any,
    page: number,
    size: number,
    sort: QuerySort<T>,
    cursor: string | null | undefined,
    totalCount: boolean
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
  /** Hook called after updating a resource */
  afterUpdate?: (resource: T) => ServiceHookResponse;
  /** Hook called after deleting a resource */
  afterDelete?: (resource: T) => ServiceHookResponse;
  /** Prisma filter or factory for full-text search */
  textSearch?: any | ((input: string) => any);
};
