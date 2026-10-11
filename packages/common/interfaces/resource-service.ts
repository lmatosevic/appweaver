import {
  AggregateOptions,
  BulkItem,
  AggregateResponse,
  AggregateSelect,
  AggregateSelected,
  QueryFilter,
  QueryOptions,
  QueryResponse,
  QuerySort,
  Resource,
  ResourceClient,
  ResourceData,
  ResourceId
} from '../types';

export interface IResourceService<
  ReadOne = Resource,
  ReadMany = Resource,
  Create = ResourceData<Resource>,
  Update = Partial<ResourceData<Resource>>,
  Query = QueryFilter<ReadOne>,
  Replace = Create
> {
  modelName: string;

  /**
   * Retrieves the client instance associated with the resource.
   *
   * @return {ResourceClient} The client instance used to interact with the resource.
   */
  get client(): ResourceClient;

  /**
   * Retrieves a specific resource by its identifier.
   *
   * @param {ResourceId} id - The unique identifier of the resource to find.
   * @return {Promise<Object>} A promise that resolves to the resource object if found.
   */
  find(id: ResourceId): Promise<ReadOne>;

  /**
   * Finds the first resource matching the provided filter.
   *
   * @param {Query} [filter] - The filter criteria the resource has to match (optional).
   * @param {QuerySort} [sort] - The sorting criteria choosing the first of several matching resources (optional,
   * defaults to `-createdAt`).
   * @return {Promise<Object | null>} A promise that resolves to the first matching resource, or null when none matches.
   */
  single(filter?: Query, sort?: QuerySort<ReadOne>): Promise<ReadOne | null>;

  /**
   * Executes a query with the specified filter, pagination, and sorting options.
   *
   * @param {QueryOptions} [options] - The query options: the `filter`, the `page` and `size` of the page, the `sort`
   * order, the `cursor` of the page to retrieve, which takes precedence over `page`, and whether to count all matching
   * records with `totalCount` (optional).
   * @return {Promise<QueryResponse<Object>>} A promise that resolves to the query response containing the results.
   */
  query(
    options?: QueryOptions<ReadMany, Query>
  ): Promise<QueryResponse<ReadMany>>;

  /**
   * Counts the resources matching the provided filter.
   *
   * @param {Query} [filter] - The filter criteria the counted resources have to match (optional).
   * @return {Promise<number>} A promise that resolves to the number of matching resources.
   */
  count(filter?: Query): Promise<number>;

  /**
   * Checks whether any resource matches the provided filter.
   *
   * @param {Query} [filter] - The filter criteria a resource has to match (optional).
   * @return {Promise<boolean>} A promise that resolves to true if at least one resource matches, otherwise false.
   */
  exists(filter?: Query): Promise<boolean>;

  /**
   * Aggregates data based on the provided query, selection criteria, and optional date range parameters.
   *
   * The response is typed by the selection rather than by the whole model, so it holds only the fields the selection
   * named when it is passed as an object literal or annotated with `satisfies`.
   *
   * @param {AggregateOptions} options - The aggregation options: the `select` criteria specifying the fields and
   * operations, the `filter` of the aggregated records, the `dateField` with the `from` and `to` dates of the range,
   * the `step` of a single period, and `safeIncrement`, choosing whether the periods follow the calculated time unit
   * or blocks of seconds relative to the starting date.
   * @return {Promise<AggregateResponse<Object>>} A promise that resolves to the aggregated response based on the
   * criteria.
   */
  aggregate<S extends AggregateSelect<ReadOne>>(
    options: AggregateOptions<ReadOne, S, Query>
  ): Promise<AggregateResponse<AggregateSelected<ReadOne, S>>>;

  /**
   * Creates a new resource based on the provided data.
   *
   * @param {Object} data - The data used to create the resource.
   * @return {Promise<Object>} A promise that resolves with the created resource.
   */
  create(data: Create): Promise<ReadOne>;

  /**
   * Updates an existing record with the provided data based on the given ID.
   *
   * @param {ResourceId} id - The unique identifier of the record to be updated.
   * @param {Object} data - The data object containing the updated fields for the record.
   * @return {Promise<Object>} A promise that resolves to the updated record.
   */
  update(id: ResourceId, data: Update): Promise<ReadOne>;

  /**
   * Replaces an existing record as a whole with the provided data based on the given ID. The updatable fields missing
   * from the data are reset to their default value, or to null.
   *
   * @param {ResourceId} id - The unique identifier of the record to be replaced.
   * @param {Object} data - The data object containing the new state of the record.
   * @return {Promise<Object>} A promise that resolves to the replaced record.
   */
  replace(id: ResourceId, data: Replace): Promise<ReadOne>;

  /**
   * Deletes a resource identified by the provided ID.
   *
   * @param {ResourceId} id - The unique identifier of the resource to be deleted.
   * @return {Promise<Object>} A promise that resolves with the deleted resource data.
   */
  delete(id: ResourceId): Promise<ReadOne>;

  /**
   * Creates many resources in a single transaction, either all of them or none.
   *
   * @param {Object[]} items - The data of every resource to create.
   * @return {Promise<Object[]>} A promise that resolves with the created resources, in the order of the items.
   */
  bulkCreate(items: Create[]): Promise<ReadOne[]>;

  /**
   * Updates the given fields of many resources in a single transaction, either all of them or none.
   *
   * @param {BulkItem[]} items - The id and the data of every resource to update.
   * @return {Promise<Object[]>} A promise that resolves with the updated resources, in the order of the items.
   */
  bulkUpdate(items: BulkItem<Update>[]): Promise<ReadOne[]>;

  /**
   * Replaces many resources as a whole in a single transaction, either all of them or none.
   *
   * @param {BulkItem[]} items - The id and the new state of every resource to replace.
   * @return {Promise<Object[]>} A promise that resolves with the replaced resources, in the order of the items.
   */
  bulkReplace(items: BulkItem<Replace>[]): Promise<ReadOne[]>;

  /**
   * Deletes many resources in a single transaction, either all of them or none.
   *
   * @param {ResourceId[]} ids - The ids of the resources to delete.
   * @return {Promise<Object[]>} A promise that resolves with the deleted resources, in the order of the ids.
   */
  bulkDelete(ids: ResourceId[]): Promise<ReadOne[]>;
}
