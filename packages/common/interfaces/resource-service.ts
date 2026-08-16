import {
  AggregateResponse,
  AggregateSelect,
  QueryFilter,
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
  Query = QueryFilter<ReadOne>
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
   * Executes a query with the specified filter, pagination, and sorting options.
   *
   * @param {Query} filter - The filter criteria used to narrow down the results.
   * @param {number} [page] - The page number to retrieve (optional).
   * @param {number} [size] - The number of items per page (optional).
   * @param {QuerySort} [sort] - The sorting criteria, given either as a comma-separated field list or as an object of
   * field directions (optional).
   * @return {Promise<QueryResponse<Object>>} A promise that resolves to the query response containing the results.
   */
  query(
    filter: Query,
    page?: number,
    size?: number,
    sort?: QuerySort<ReadMany>
  ): Promise<QueryResponse<ReadMany>>;

  /**
   * Aggregates data based on the provided query, selection criteria, and optional date range parameters.
   *
   * @param {Query} filter - The query object used to filter records for aggregation.
   * @param {AggregateSelect<Object>} select - The aggregation selection criteria specifying the fields and operations.
   * @param {string} [dateField] - The optional date field to use for range-based aggregation.
   * @param {string} [from] - The optional start date for filtering data within a specific range.
   * @param {string} [to] - The optional end date for filtering data within a specific range.
   * @param {number} [step] - The optional step value for bucketing or interval aggregation.
   * @param {boolean} [safeIncrement] - Whether to increment time periods based on the calculated time difference, or
   * otherwise use increments in blocks by seconds relative to the starting date.
   * @return {Promise<AggregateResponse<Object>>} A promise that resolves to the aggregated response based on the
   * criteria.
   */
  aggregate(
    filter: Query,
    select: AggregateSelect<ReadOne>,
    dateField?: string,
    from?: string,
    to?: string,
    step?: number,
    safeIncrement?: boolean
  ): Promise<AggregateResponse<ReadOne>>;

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
   * Deletes a resource identified by the provided ID.
   *
   * @param {ResourceId} id - The unique identifier of the resource to be deleted.
   * @return {Promise<Object>} A promise that resolves with the deleted resource data.
   */
  delete(id: ResourceId): Promise<ReadOne>;
}
