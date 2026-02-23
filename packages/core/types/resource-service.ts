import {
  AggregateResponse,
  AggregateSelect,
  QueryResponse
} from '@appweaver/common';
import { Resource, ResourceClient, ResourceData } from './resource';

export interface IResourceService<
  ReadOne = Resource,
  ReadMany = Resource,
  Create = ResourceData<Resource>,
  Update = Partial<ResourceData<Resource>>,
  Query = any
> {
  modelName: string;

  get client(): ResourceClient;

  find(id: number): Promise<ReadOne>;

  query(
    filter: Query,
    page?: number,
    size?: number,
    sort?: string
  ): Promise<QueryResponse<ReadMany>>;

  aggregate(
    filter: Query,
    select: AggregateSelect<ReadOne>,
    dateField?: string,
    from?: string,
    to?: string,
    step?: number,
    safeIncrement?: boolean
  ): Promise<AggregateResponse<ReadOne>>;

  create(data: Create): Promise<ReadOne>;

  update(id: number, data: Update): Promise<ReadOne>;

  delete(id: number): Promise<ReadOne>;
}
