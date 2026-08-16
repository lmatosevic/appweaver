import {
  ActionType,
  AggregateResponse,
  AggregateSelect,
  AggregateSelected,
  countFieldName,
  Database,
  defaultScalarValue,
  Events,
  extractResourceName,
  extractSchemaProperties,
  IResourceService,
  isArray,
  isPlainObject,
  QueryFilter,
  QueryResponse,
  QuerySort,
  removeUndefined,
  Resource,
  ResourceId,
  ResourceClient,
  ResourceData,
  uncapitalize
} from '@appweaver/common';
import { inject, injectModel } from '../context';
import { projectVirtualFields } from '../utils';
import { PrismaDatabase } from '../database';
import { CacheService } from '../cache';
import { HttpError } from '../errors';
import {
  aggregationRecordCount,
  buildAggregationPeriods,
  checkAggregationDateField,
  createdByConnect,
  mapAggregationResult,
  mapAggregationSelect,
  mapQueryFilter,
  readAggregationBoundaries,
  mapRelationActions,
  mapRelationInclusions,
  mapSortValues
} from './utils';

export abstract class ResourceService<
  ReadOne = Resource,
  ReadMany = Resource,
  Create = ResourceData<Resource>,
  Update = Partial<ResourceData<Resource>>,
  Query = QueryFilter<ReadOne>
> implements IResourceService<ReadOne, ReadMany, Create, Update, Query> {
  /** @internal */
  private readonly _db = inject<PrismaDatabase>(Database as any);
  /** @internal */
  private readonly _events = inject(Events);
  /** @internal */
  private readonly _cacheService = inject(CacheService);
  /** @internal */
  private readonly _client: ResourceClient;

  /**
   * Creates the service for the given resource model and resolves its database
   * client from the Prisma client instance.
   *
   * @param {string} modelName The resource model name this service operates on,
   * as defined by its model file (i.e. `User`, `Post`).
   * @throws An error if no database client exists for the provided model name.
   */
  constructor(public readonly modelName: string) {
    this._client = this._db.client()[uncapitalize(modelName)];
    if (!this._client) {
      throw new Error(
        `ResourceService initialized with invalid model name: ${modelName}`
      );
    }
  }

  /**
   * The underlying Prisma model delegate for this resource, useful for
   * executing custom database operations that the service methods do not cover.
   *
   * @returns {ResourceClient} The resource client of the model this service was
   * created for.
   */
  public get client(): ResourceClient {
    return this._client;
  }

  /**
   * Finds a single resource by its id, applying the read restrictions and the
   * access check of this service, and including all relation and file fields
   * configured for output on the find action. A resource event is emitted after
   * a successful lookup.
   *
   * @param {ResourceId} id The id of the resource to find.
   * @returns {Promise<Object>} The found resource with its virtual fields and
   * relation counts projected.
   * @throws {@link HttpError} 404 if the resource does not exist or is filtered
   * out by the read restrictions, 403 if the access check denies it, and 500 on
   * a database error.
   */
  public async find(id: ResourceId): Promise<ReadOne> {
    const restrictions = await this.readRestrictions('find', id);
    const includeRelations = mapRelationInclusions(this._client.name, 'find');

    let resource: ReadOne;
    try {
      resource = await this._client.findFirst({
        where: { id, ...restrictions },
        include: includeRelations
      });
    } catch (e) {
      throw new HttpError(`${this._client.name} find error`, 500, e);
    }

    if (!resource || (resource as any).id !== id) {
      throw new HttpError(`${this._client.name} data not found`, 404);
    }

    const access = await this.checkAccess('find', resource);
    if (!access) {
      throw new HttpError(`${this._client.name} data access is forbidden`, 403);
    }

    this._events.emitResourceEvent(this._client.name, 'find', {
      current: resource
    });

    return this.projectResource(resource);
  }

  /**
   * Queries a page of resources matching the provided filter. The filter is
   * mapped to a database query, combined with the optional `searchText` full
   * text search query and the read restrictions of this service, and executed
   * together with the total count in a single transaction. A resource event is
   * emitted after a successful query.
   *
   * @param {Object} [filter] The query filter object, supporting the logical
   * (`_and`, `_or`, `_not`, `_nor`), comparison (`_eq`, `_ne`, `_gt`, `_gte`,
   * `_lt`, `_lte`, `_in`, `_nin`, `_between`, `_like`, `_ilike`, `_starts`,
   * `_ends`, `_contains`, `_exists`), list (`_has`, `_hasSome`, `_hasEvery`,
   * `_isEmpty`), and relation (`_some`, `_every`, `_none`) operators, as well
   * as plain field values. Its `searchText` property, if present, is passed to
   * {@link ResourceService.textSearchQuery} instead of being matched as a
   * field.
   * @param {number} [page] The one-based page number of results to return.
   * @param {number} [size] The maximum number of results per page.
   * @param {QuerySort} [sort] The fields to sort by, either as a comma-separated
   * list where a field prefixed with `-` is sorted in descending order
   * (i.e. `-createdAt,id`), or as an object of field directions
   * (i.e. `{ createdAt: 'desc', id: 'asc' }`). Both forms support the fields of
   * the included to-one relations, given with a dot notation (`author.createdAt`)
   * or as a nested object (`{ author: { createdAt: 'desc' } }`).
   * @returns {Promise<QueryResponse<Object>>} The paged query response containing
   * the returned resources, the count of the returned items and the total count
   * of matching resources.
   * @throws {@link HttpError} 400 if the sort input names a field that cannot be
   * sorted by, and 500 on a database error.
   */
  public async query(
    filter: Query = {} as any,
    page: number = 1,
    size: number = 50,
    sort: QuerySort<ReadMany> = '-createdAt,id'
  ): Promise<QueryResponse<ReadMany>> {
    const restrictions = await this.readRestrictions('query', filter);
    const textSearch = this.extractTextSearchQuery(filter);
    const mappedFilter = mapQueryFilter(filter, this._client.name);

    const query = { AND: [mappedFilter, textSearch, restrictions] };
    const includeRelations = mapRelationInclusions(this._client.name, 'query');
    const orderBy = mapSortValues(sort, this._client.name, 'query');

    let resources: ReadMany[];
    let totalCount: number;
    try {
      [resources, totalCount] = await this._db.client().$transaction([
        this._client.findMany({
          where: { ...query },
          include: includeRelations,
          skip: (page - 1) * size,
          take: size,
          orderBy
        }),
        this._client.count({
          where: { ...query }
        })
      ]);
    } catch (e) {
      throw new HttpError(`${this._client.name} query error`, 500, e);
    }

    this._events.emitResourceEvent(this._client.name, 'query', {
      current: resources
    });

    return {
      resultCount: resources.length,
      totalCount,
      items: resources.map((resource) => this.projectResource(resource))
    };
  }

  /**
   * Aggregates resources matching the provided filter over a date range, both
   * as a single overall result and as a series of results for the equally sized
   * periods the range is split into. All aggregations are executed in a single
   * transaction.
   *
   * @param {Object} [filter] The query filter object, mapped the same way as in
   * {@link ResourceService.query}.
   * @param {AggregateSelect<Object>} select The aggregation operations to perform
   * per field (i.e. `{ views: { count: true, sum: true } }`). Only the numeric
   * fields of the model accept every operator, while its date fields accept
   * `count`, `min`, `max`, `first` and `last`. The `first` and `last` operators
   * take the value the earliest and the latest record of a period holds, which
   * costs one additional query per period and boundary, skipped for the periods
   * holding no record.
   * @param {string} [dateField] The date field the range is applied on.
   * @param {string} [from] The ISO date string of the range start. Defaults to
   * seven days before the range end.
   * @param {string} [to] The ISO date string of the range end. Defaults to the
   * current date and time.
   * @param {number} [step] The size of a single period in units of the
   * automatically selected time unit. If not provided, one unit is used and the
   * unit is derived from the range length (seconds up to a minute, minutes up to
   * an hour, hours up to a day, days up to a month, months up to a year, and
   * years beyond that).
   * @param {boolean} [safeIncrement] Whether the period increments use the
   * derived time unit and stay consistent across daylight saving time changes.
   * When false, the step is interpreted in seconds.
   * @returns {Promise<AggregateResponse<Object>>} The aggregation response with
   * the overall total and one result per period, each labeled with the median
   * date of its period. It is typed by the fields the selection named, not by
   * the whole model, whenever the selection is passed as an object literal or
   * annotated with `satisfies`.
   * @throws {@link HttpError} 400 if the selection is empty or names a field or
   * operator that cannot be aggregated, and 500 on a database error.
   */
  public async aggregate<S extends AggregateSelect<ReadOne>>(
    filter: Query = {} as any,
    select: S,
    dateField: string = 'createdAt',
    from?: string,
    to?: string,
    step?: number,
    safeIncrement: boolean = true
  ): Promise<AggregateResponse<AggregateSelected<ReadOne, S>>> {
    const {
      fromDate,
      toDate,
      ranges: dateRanges
    } = buildAggregationPeriods(from, to, step, safeIncrement);

    const operations = mapAggregationSelect(select, this._client.name);
    checkAggregationDateField(dateField, this._client.name);

    const restrictions = await this.readRestrictions('aggregate', filter);
    const textSearch = this.extractTextSearchQuery(filter);
    const mappedFilter = mapQueryFilter(filter, this._client.name);

    const query = { AND: [mappedFilter, textSearch, restrictions] };

    const rangeQuery = (rangeFrom: Date, rangeTo: Date) => ({
      AND: [query, { [dateField]: { gte: rangeFrom, lt: rangeTo } }]
    });

    // Aggregates a single range and reads the boundary records it holds the
    // first and last values of which the database cannot aggregate
    const aggregateRange = async (txModel: any, where: any) => {
      const result = await txModel.aggregate({
        ...operations.aggregate,
        where
      });

      const boundaries = await readAggregationBoundaries(
        txModel,
        where,
        dateField,
        operations,
        aggregationRecordCount(result)
      );

      return { ...result, ...boundaries };
    };

    let total: Record<string, Record<string, any>> = {};
    let items: Record<string, Record<string, any>>[] = [];
    try {
      [total, items] = await this._db.client().$transaction(async (tx) => {
        const txModel = tx[this._client.name];

        const overall = await aggregateRange(
          txModel,
          rangeQuery(fromDate, toDate)
        );

        // Skip executing the same query if only one range value is generated
        if (dateRanges.length === 1) {
          return [overall, [overall]];
        }

        const ranges = await Promise.all(
          dateRanges.map((dateRange) =>
            aggregateRange(txModel, rangeQuery(dateRange.from, dateRange.to))
          )
        );

        return [overall, ranges];
      });
    } catch (e) {
      throw new HttpError('Error on results aggregation', 500, e);
    }

    return {
      total: mapAggregationResult<AggregateSelected<ReadOne, S>>(total),
      items: items.map((item, index) => ({
        date: dateRanges[index].median,
        result: mapAggregationResult<AggregateSelected<ReadOne, S>>(item)
      }))
    };
  }

  /**
   * Creates a new resource. The provided data is merged with the write
   * restrictions, checked for access, sanitized against the model configuration
   * and mapped to the relation write actions (connect, create, or
   * connect-or-create) before the record is created. The `createdBy` audit
   * relation is connected to the currently authenticated user when configured.
   * The resource cache is invalidated and a resource event is emitted after a
   * successful create.
   *
   * @param {Object} data The data of the resource to create, including any inline
   * relation and file payloads.
   * @returns {Promise<Object>} The created resource with its virtual fields and
   * relation counts projected.
   * @throws {@link HttpError} 403 if the access check denies the action, 400 if
   * an inline relation payload is missing required fields or the relation does
   * not accept new records, and 500 on a database error.
   */
  public async create(data: Create): Promise<ReadOne> {
    const createdBy = createdByConnect(this._client.name);

    const restrictions = await this.writeRestrictions('create', data);

    const createData = removeUndefined({
      ...data,
      ...restrictions
    });

    const access = await this.checkAccess('create', createData as ReadOne);
    if (!access) {
      throw new HttpError(
        `${this._client.name} create action is forbidden`,
        403
      );
    }

    const sanitizedData = this.sanitizeData('create', createData);

    const connectRelations = mapRelationActions(
      this._client.name,
      'create',
      sanitizedData
    );
    const includeRelations = mapRelationInclusions(this._client.name, 'create');

    let resource: ReadOne;
    try {
      resource = await this._client.create({
        data: {
          ...sanitizedData,
          ...connectRelations,
          createdBy
        },
        include: includeRelations
      });
    } catch (e) {
      throw new HttpError(`${this._client.name} create error`, 500, e);
    }

    await this._cacheService.invalidateCache(this._client.name, 'create');

    this._events.emitResourceEvent(this._client.name, 'create', {
      current: resource
    });

    return this.projectResource(resource);
  }

  /**
   * Updates an existing resource by its id. The current record is loaded with
   * the read restrictions applied and checked for access, then updated with the
   * data merged with the write restrictions inside a single transaction.
   * Relations missing from the new value are disconnected, or deleted when
   * `orphanRemoval` is configured for them. The resource cache is invalidated
   * and a resource event carrying both the previous and the current state is
   * emitted after a successful update.
   *
   * @param {ResourceId} id The id of the resource to update.
   * @param {Object} data The partial data to update the resource with, including
   * any inline relation and file payloads.
   * @returns {Promise<Object>} The updated resource with its virtual fields and
   * relation counts projected.
   * @throws {@link HttpError} 404 if the resource does not exist or is filtered
   * out by the read restrictions, 403 if the access check denies the action, 400
   * if an inline relation payload is missing required fields or the relation
   * does not accept new records, and 500 on a database error.
   */
  public async update(id: ResourceId, data: Update): Promise<ReadOne> {
    const readRestrictions = await this.readRestrictions('update', {
      id,
      ...data
    });

    const writeRestrictions = await this.writeRestrictions('update', {
      id,
      ...data
    });

    const updateData = removeUndefined({
      ...data,
      ...writeRestrictions
    });

    const sanitizedData = this.sanitizeData('update', updateData);

    const includeRelations = mapRelationInclusions(this._client.name, 'update');

    let updateResource: ReadOne;
    let resource: ReadOne;
    try {
      [updateResource, resource] = await this._db
        .client()
        .$transaction(async (tx) => {
          const txModel = tx[this._client.name];

          const current = await txModel.findFirst({
            where: { id, ...readRestrictions },
            include: includeRelations
          });
          if (!current || current.id !== id) {
            throw new HttpError(`${this._client.name} data not found`, 404);
          }

          const access = await this.checkAccess('update', current);
          if (!access) {
            throw new HttpError(
              `${this._client.name} update action is forbidden`,
              403
            );
          }

          const setRelations = mapRelationActions(
            this._client.name,
            'update',
            sanitizedData,
            current
          );

          const updated = await txModel.update({
            where: { id },
            include: includeRelations,
            data: { ...sanitizedData, ...setRelations }
          });

          return [current, updated];
        });
    } catch (e) {
      if (e instanceof HttpError) {
        throw e;
      }
      throw new HttpError(`${this._client.name} update error`, 500, e);
    }

    await this._cacheService.invalidateCache(this._client.name, 'update');

    this._events.emitResourceEvent(this._client.name, 'update', {
      previous: updateResource,
      current: resource
    });

    return this.projectResource(resource);
  }

  /**
   * Deletes an existing resource by its id. The current record is loaded with
   * the read restrictions applied and checked for access before it is deleted
   * inside a single transaction. The resource cache is invalidated and a
   * resource event is emitted after a successful delete.
   *
   * @param {ResourceId} id The id of the resource to delete.
   * @returns {Promise<Object>} The deleted resource with its virtual fields and
   * relation counts projected.
   * @throws {@link HttpError} 404 if the resource does not exist or is filtered
   * out by the read restrictions, 403 if the access check denies the action, and
   * 500 on a database error.
   */
  public async delete(id: ResourceId): Promise<ReadOne> {
    const restrictions = await this.readRestrictions('delete', id);

    let resource: ReadOne;
    try {
      resource = await this._db.client().$transaction(async (tx) => {
        const txModel = tx[this._client.name];

        const current = await txModel.findFirst({
          where: { id, ...restrictions }
        });
        if (!current || current.id !== id) {
          throw new HttpError(`${this._client.name} data not found`, 404);
        }

        const access = await this.checkAccess('delete', current);
        if (!access) {
          throw new HttpError(
            `${this._client.name} delete action is forbidden`,
            403
          );
        }

        const includeRelations = mapRelationInclusions(
          this._client.name,
          'delete'
        );

        return await txModel.delete({
          where: { id },
          include: includeRelations
        });
      });
    } catch (e) {
      if (e instanceof HttpError) {
        throw e;
      }
      throw new HttpError(`${this._client.name} delete error`, 500, e);
    }

    await this._cacheService.invalidateCache(this._client.name, 'delete');

    this._events.emitResourceEvent(this._client.name, 'delete', {
      current: resource
    });

    return this.projectResource(resource);
  }

  /**
   * This method should be overridden with custom logic for restricting read
   * operations on specific data for currently logged-in user and other
   * authorization rules. The returned object will be applied as a filter on
   * all actions (except create action) which will prevent unwanted data access
   * and modifications. This method can also cancel the current action by
   * throwing an error, recommended is {@link HttpError } with appropriate HTTP
   * error code.
   *
   * @param {ActionType} action The called action method on this service (find,
   * query, aggregate, update, or delete)
   * @param {Object|ResourceId} data The passed data to the called function can be
   * number or object. If the data is a type of number, then it represents the
   * resource id, otherwise it depends on the action and can be one of the
   * following:
   *
   * - query and aggregate -> filter object
   * - update -> combined id and the data object (i.e. { id, ...data })
   *
   * For other actions (find and delete) it represents the resource id.
   * @return {Promise<Object>} The database-level `where` conditions containing
   * additional query restrictions. The returned object is applied directly to
   * the database query, so it uses the native Prisma filter syntax.
   */
  protected async readRestrictions(
    action: Exclude<ActionType, 'create'>,
    data: any
  ): Promise<any> {
    return {};
  }

  /**
   * This method should be overridden with custom logic for restricting write
   * operations on specific data for currently logged-in users and other
   * authorization rules. The returned object will be applied as a filter on
   * all actions (create and update) to ensure that users can only modify
   * data they are authorized to access. This method can also cancel the
   * current action by throwing an error, with the recommended type being
   * {@link HttpError} with the appropriate HTTP error code.
   *
   * @param {'create'|'update'} action The called action method on this service
   * (create or update)
   * @param {Object} data The passed data to the called function, which should be
   * an object representing the resource data to be created or updated. For
   * update operations, this object will also include the resource ID.
   *
   * @return {Promise<Object>} A partial object containing additional data
   * restrictions to be applied, or an empty object if no restrictions are
   * necessary.
   */
  protected async writeRestrictions(
    action: 'create' | 'update',
    data: any
  ): Promise<Partial<Create & Update>> {
    return {};
  }

  /**
   * This method should provide logic for checking the access permissions for
   * the provided resource object. If the resource should not be accessible by
   *  a currently authenticated user or other logic, this method should return
   * false. Otherwise, it returns true and continues with the request execution.
   *
   * @param {ActionType} action The called action method on this service (find,
   * query, aggregate, create, update, or delete)
   * @param {Object} resource The resource object that is being checked for access.
   * @returns {Promise<boolean>} True if the access for resource is granted, false
   * otherwise.
   */
  protected async checkAccess(
    action: ActionType,
    resource: ReadOne
  ): Promise<boolean> {
    return true;
  }

  /**
   * Constructs a query object for performing a text search on resources in the
   * database based on the provided search text. This method will transform the
   * search text into a format suitable for text search functionality, returning
   * a query object that can be used to filter results.
   *
   * @param {string} searchText The text string used for searching resources.
   * @returns {Object} A query object that represents the conditions for the text
   * search operation, using the native Prisma filter syntax. This will be used
   * by the database query methods to retrieve matching resources.
   */
  protected textSearchQuery(searchText: string): any {
    return {};
  }

  /**
   * Removes the `searchText` property from the provided filter and converts it
   * into a text search query using
   * {@link ResourceService.textSearchQuery}. The filter object is mutated so the
   * search text is not matched as a regular resource field.
   *
   * @param {Object} filter The request filter object, possibly containing a
   * `searchText` property. The property is deleted from this object when present.
   * @returns {Object} The text search query for the extracted search text, or an
   * empty object if the filter contains no search text.
   */
  private extractTextSearchQuery(filter: any): any {
    if (filter.searchText) {
      const searchQuery = this.textSearchQuery(filter.searchText);
      delete filter.searchText;
      return searchQuery;
    }
    return {};
  }

  /**
   * Prepares a resource for the response by resolving the virtual fields of its
   * model and flattening the Prisma `_count` aggregation into the individual
   * relation count fields (i.e. `_count.posts` becomes `postsCount`).
   *
   * @param {Object} resource The resource object as returned by the database
   * client.
   * @returns {Object} The same resource with the virtual fields resolved and, if a
   * `_count` selection was present, with a count property per counted relation
   * and the `_count` property removed.
   */
  private projectResource<T>(resource: T): T {
    const projectedResource = projectVirtualFields(resource, this._client.name);

    if (!isPlainObject(projectedResource['_count'])) {
      return projectedResource;
    }

    // Create new relation count properties on the resource object
    for (const [key, count] of Object.entries(projectedResource['_count'])) {
      projectedResource[countFieldName(key)] = count;
    }

    delete projectedResource['_count'];

    return projectedResource;
  }

  /**
   * Prepares a write payload for the database by removing the virtual fields
   * that have no column, filling in default values for the hidden required
   * scalars of a create action, and recursively applying the same rules to the
   * nested relation and file payloads. Unique key values, arrays of them and null
   * values are left untouched, so the relation actions can still map them to the
   * connect and disconnect operations.
   *
   * @param {'create'|'update'} action The write action the payload is sanitized
   * for. Default values for the hidden required scalars are only applied on a
   * create action.
   * @param {Object} data The write payload to sanitize.
   * @param {string} [resourceName] The name of the model the payload belongs to.
   * Defaults to the model of this service and is set to the related model name
   * when recursing into a nested relation or file payload.
   * @returns {Object} A shallow copy of the payload without the virtual fields,
   * with the missing hidden required scalars defaulted, and with the nested
   * payloads sanitized against their own models.
   */
  private sanitizeData<T>(
    action: 'create' | 'update',
    data: T,
    resourceName?: string
  ): T {
    const sanitizedData = { ...data };

    const resourceModel = injectModel(resourceName ?? this._client.name, false);
    const relationsModel = resourceModel?.relationsModel;
    const filesModel = resourceModel?.filesModel;

    // Delete virtual fields from data object to avoid database errors
    for (const fieldName of Object.keys(resourceModel?.config?.virtual ?? {})) {
      delete sanitizedData[fieldName];
    }

    // Map default values for hidden scalars if a property is required without
    // a provided default value, and scalar values are not set yet, this is only
    // required for create actions
    for (const [fieldName, scalar] of Object.entries(
      resourceModel?.config?.scalars ?? {}
    )) {
      if (
        action === 'create' &&
        scalar.hidden &&
        scalar.required !== false &&
        scalar.default === undefined &&
        sanitizedData[fieldName] === undefined
      ) {
        sanitizedData[fieldName] = defaultScalarValue(scalar);
      }
    }

    // Recursively sanitize nested objects and arrays of objects
    for (const key in sanitizedData) {
      const value = sanitizedData[key];

      const relationSchema = extractSchemaProperties(relationsModel, key);
      const fileSchema = extractSchemaProperties(filesModel, key);

      // Only nested resource payloads are sanitized. Unique key values, arrays
      // of them and null values are left untouched, so the relation actions can
      // still map them to connect and disconnect operations.
      if (isPlainObject(value) || (isArray(value) && isPlainObject(value[0]))) {
        const resourceName = extractResourceName(relationSchema ?? fileSchema);
        if (resourceName) {
          sanitizedData[key] = isArray(value)
            ? (value.map((item: any) =>
                this.sanitizeData(action, item, resourceName)
              ) as any)
            : this.sanitizeData(action, value, resourceName);
        }
      }
    }

    return sanitizedData;
  }
}
