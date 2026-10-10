import {
  ActionType,
  AggregateOptions,
  AggregateResponse,
  AggregateSelect,
  AggregateSelected,
  ConfigurationError,
  countFieldName,
  Database,
  defaultScalarValue,
  ErrorCode,
  Events,
  extractResourceName,
  extractSchemaProperties,
  hasSoftDelete,
  IResourceService,
  isArray,
  isPlainObject,
  QueryFilter,
  QueryOptions,
  QueryResponse,
  QuerySort,
  removeUndefined,
  Resource,
  ResourceId,
  ResourceClient,
  ResourceData,
  uncapitalize,
  isAppweaverError
} from '@appweaver/common';
import { inject, injectModel } from '../context';
import {
  arePoliciesSkipped,
  liveRecordFilter,
  projectVirtualFields
} from '../utils';
import { PrismaDatabase, toDatabaseError } from '../database';
import { CacheService } from '../cache';
import { FileService } from '../storage';
import { ResourceError } from './resource-error';
import {
  AffectedRecords,
  aggregationRecordCount,
  assertLiveRelationTargets,
  buildAggregationPeriods,
  cascadedRecords,
  checkAggregationDateField,
  createdByConnect,
  decodeCursor,
  DeletedRecords,
  hideDeletedRelations,
  mapAggregationResult,
  mapAggregationSelect,
  mapQueryFilter,
  readAggregationBoundaries,
  mapRelationActions,
  mapRelationInclusions,
  mapStableSortValues,
  mergeAffectedRecords,
  pageCursors,
  queryFingerprint,
  removeOrphans,
  retainDeletedFiles,
  softDeleteCascade,
  softDeleteData
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
  private readonly _modelKey: string;

  /**
   * Creates the service for the given resource model and resolves its database
   * client from the Prisma client instance.
   *
   * @param {string} modelName The resource model name this service operates on,
   * as defined by its model file (i.e. `User`, `Post`).
   * @throws An error if no database client exists for the provided model name.
   */
  constructor(public readonly modelName: string) {
    this._modelKey = uncapitalize(modelName);
    if (!this._client) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `ResourceService initialized with invalid model name: ${modelName}`
      );
    }
  }

  /**
   * The underlying Prisma model delegate for this resource, useful for
   * executing custom database operations that the service methods do not cover.
   *
   * @returns {ResourceClient} The resource client of the model this service was
   * created for, bound to the current transaction (see `runTransaction`).
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
   * @throws {@link ResourceError} `RESOURCE_NOT_FOUND` if the resource does not
   * exist or is filtered out by the read restrictions, `RESOURCE_FORBIDDEN` if
   * the access check denies it, and a {@link DatabaseError} on a database error.
   */
  public async find(id: ResourceId): Promise<ReadOne> {
    const restrictions = await this.applyReadRestrictions('find', id);
    const includeRelations = mapRelationInclusions(this._client.name, 'find');

    let resource: ReadOne;
    try {
      resource = await this._client.findFirst({
        where: { id, ...restrictions, ...liveRecordFilter(this._client.name) },
        include: includeRelations
      });
    } catch (e) {
      throw this.databaseError(e, id);
    }

    if (!resource || (resource as any).id !== id) {
      throw new ResourceError(
        ErrorCode.ResourceNotFound,
        `${this._client.name} not found`,
        { model: this._client.name, id }
      );
    }

    const access = await this.applyAccessCheck('find', resource);
    if (!access) {
      throw new ResourceError(
        ErrorCode.ResourceForbidden,
        `${this._client.name} access is forbidden`,
        { model: this._client.name, action: 'find' }
      );
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
   * @param {QueryOptions} [options] The query options:
   * - `filter` The query filter object, supporting the logical (`_and`, `_or`,
   *   `_not`, `_nor`), comparison (`_eq`, `_ne`, `_gt`, `_gte`, `_lt`, `_lte`,
   *   `_in`, `_nin`, `_between`, `_like`, `_ilike`, `_starts`, `_ends`,
   *   `_contains`, `_exists`), list (`_has`, `_hasSome`, `_hasEvery`,
   *   `_isEmpty`), and relation (`_some`, `_every`, `_none`) operators, as well
   *   as plain field values. Its `searchText` property, if present, is passed to
   *   {@link ResourceService.textSearchQuery} instead of being matched as a
   *   field.
   * - `page` The one-based page number of results to return, ignored when a
   *   cursor is given (default: `1`).
   * - `size` The maximum number of results per page (default: `50`).
   * - `sort` The fields to sort by, either as a comma-separated list where a
   *   field prefixed with `-` is sorted in descending order (i.e.
   *   `-createdAt,id`), or as an object of field directions (i.e.
   *   `{ createdAt: 'desc', id: 'asc' }`). Both forms support the fields of the
   *   included to-one relations, given with a dot notation (`author.createdAt`)
   *   or as a nested object (`{ author: { createdAt: 'desc' } }`) (default:
   *   `-createdAt`).
   * - `cursor` The cursor of the page to return, as issued in the `nextCursor`
   *   or `prevCursor` of an earlier response, which also carries the direction
   *   the page runs in. Takes precedence over `page`.
   * - `totalCount` Whether to count all matching resources, which costs a scan
   *   of every one of them (default: `true`).
   * @returns {Promise<QueryResponse<Object>>} The paged query response containing
   * the returned resources, the count of the returned items, the cursors of the
   * adjacent pages, and the total count unless it was opted out of.
   * @throws {@link ResourceError} `RESOURCE_INVALID_SORT` if the sort input names
   * a field that cannot be sorted by, `RESOURCE_INVALID_CURSOR` if the cursor
   * was issued for another filter or sort order, and a {@link DatabaseError} on
   * a database error.
   */
  public async query(
    options: QueryOptions<ReadMany, Query> = {}
  ): Promise<QueryResponse<ReadMany>> {
    const {
      filter = {} as Query,
      page = 1,
      size = 50,
      sort = '-createdAt',
      cursor,
      totalCount = true
    } = options;

    const query = await this.queryConditions('query', filter);
    const includeRelations = mapRelationInclusions(this._client.name, 'query');
    const orderBy = mapStableSortValues(sort, this._client.name, 'query');

    // Binding to the mapped query rather than the filter also invalidates a
    // cursor on a changed text search or read restriction
    const fingerprint = queryFingerprint(this._client.name, query, orderBy);
    const decodedCursor = decodeCursor(cursor, fingerprint);

    // One record past the page tells whether a further page exists
    const backward = decodedCursor?.backward === true;
    const take = size > 0 ? size + 1 : 0;

    const findMany = this._client.findMany({
      where: { ...query },
      include: includeRelations,
      // A cursor skips the record it addresses, an offset the pages before it
      cursor: decodedCursor ? { id: decodedCursor.id } : undefined,
      skip: decodedCursor ? 1 : (page - 1) * size,
      take: backward ? -take : take,
      orderBy
    });

    let resources: ReadMany[];
    let count: number | undefined;
    try {
      if (totalCount) {
        [resources, count] = await this._db
          .client()
          .$transaction([
            findMany,
            this._client.count({ where: { ...query } })
          ]);
      } else {
        resources = await findMany;
      }
    } catch (e) {
      throw this.databaseError(e);
    }

    // The over-fetched record leads a backward page and trails a forward one
    const hasMore = resources.length > size;
    if (hasMore) {
      resources = backward
        ? resources.slice(resources.length - size)
        : resources.slice(0, size);
    }

    // The page a cursor was followed from always exists
    const hasNext = backward || hasMore;
    const hasPrev = backward ? hasMore : !!decodedCursor || page > 1;

    this._events.emitResourceEvent(this._client.name, 'query', {
      current: resources
    });

    return {
      resultCount: resources.length,
      totalCount: count ?? null,
      ...pageCursors(resources, fingerprint, hasNext, hasPrev),
      items: resources.map((resource) => this.projectResource(resource))
    };
  }

  /**
   * Finds the first resource matching the provided filter, applying the read
   * restrictions of the query action and the access check of the find action,
   * and including the relation and file fields configured for output on the
   * find action. A resource event of the find action is emitted when a resource
   * matches.
   *
   * @param {Object} [filter] The query filter object, mapped the same way as in
   * {@link ResourceService.query}.
   * @param {QuerySort} [sort] The fields to sort the matching resources by, of
   * which the first one is returned, in the same form as in
   * {@link ResourceService.query} (default: `-createdAt`).
   * @returns {Promise<Object|null>} The first matching resource with its virtual
   * fields and relation counts projected, or null when none matches.
   * @throws {@link ResourceError} `RESOURCE_FORBIDDEN` if the access check denies
   * the matching resource, `RESOURCE_INVALID_SORT` if the sort input names a
   * field that cannot be sorted by, and a {@link DatabaseError} on a database
   * error.
   */
  public async single(
    filter: Query = {} as Query,
    sort: QuerySort<ReadOne> = '-createdAt'
  ): Promise<ReadOne | null> {
    const where = await this.queryConditions('query', filter);
    const includeRelations = mapRelationInclusions(this._client.name, 'find');
    const orderBy = mapStableSortValues(sort, this._client.name, 'find');

    let resource: ReadOne | null;
    try {
      resource = await this._client.findFirst({
        where,
        include: includeRelations,
        orderBy
      });
    } catch (e) {
      throw this.databaseError(e);
    }

    if (!resource) {
      return null;
    }

    const access = await this.applyAccessCheck('find', resource);
    if (!access) {
      throw new ResourceError(
        ErrorCode.ResourceForbidden,
        `${this._client.name} access is forbidden`,
        { model: this._client.name, action: 'find' }
      );
    }

    this._events.emitResourceEvent(this._client.name, 'find', {
      current: resource
    });

    return this.projectResource(resource);
  }

  /**
   * Counts the resources matching the provided filter, applying the read
   * restrictions of the query action.
   *
   * @param {Object} [filter] The query filter object, mapped the same way as in
   * {@link ResourceService.query}.
   * @returns {Promise<number>} The number of matching resources.
   * @throws {@link DatabaseError} On a database error.
   */
  public async count(filter: Query = {} as Query): Promise<number> {
    const where = await this.queryConditions('query', filter);

    try {
      return await this._client.count({ where });
    } catch (e) {
      throw this.databaseError(e);
    }
  }

  /**
   * Checks whether any resource matches the provided filter, applying the read
   * restrictions of the query action.
   *
   * @param {Object} [filter] The query filter object, mapped the same way as in
   * {@link ResourceService.query}.
   * @returns {Promise<boolean>} True if at least one resource matches, otherwise
   * false.
   * @throws {@link DatabaseError} On a database error.
   */
  public async exists(filter: Query = {} as Query): Promise<boolean> {
    const where = await this.queryConditions('query', filter);

    let resource: { id: ResourceId } | null;
    try {
      resource = await this._client.findFirst({ where, select: { id: true } });
    } catch (e) {
      throw this.databaseError(e);
    }

    return resource !== null;
  }

  /**
   * Aggregates resources matching the provided filter over a date range, both
   * as a single overall result and as a series of results for the equally sized
   * periods the range is split into. All aggregations are executed in a single
   * transaction.
   *
   * @param {AggregateOptions} options The aggregation options:
   * - `select` The aggregation operations to perform per field (i.e.
   *   `{ views: { count: true, sum: true } }`). Only the numeric fields of the
   *   model accept every operator, while its date fields accept `count`, `min`,
   *   `max`, `first` and `last`. The `first` and `last` operators take the value
   *   the earliest and the latest record of a period holds, which costs one
   *   additional query per period and boundary, skipped for the periods holding
   *   no record.
   * - `filter` The query filter object, mapped the same way as in
   *   {@link ResourceService.query}.
   * - `dateField` The date field the range is applied on (default:
   *   `createdAt`).
   * - `from` The ISO date string of the range start. Defaults to seven days
   *   before the range end.
   * - `to` The ISO date string of the range end. Defaults to the current date
   *   and time.
   * - `step` The size of a single period in units of the automatically selected
   *   time unit. If not provided, one unit is used and the unit is derived from
   *   the range length (seconds up to a minute, minutes up to an hour, hours up
   *   to a day, days up to a month, months up to a year, and years beyond that).
   * - `safeIncrement` Whether the period increments use the derived time unit
   *   and stay consistent across daylight saving time changes. When false, the
   *   step is interpreted in seconds (default: `true`).
   * @returns {Promise<AggregateResponse<Object>>} The aggregation response with
   * the overall total and one result per period, each labeled with the median
   * date of its period. It is typed by the fields the selection named, not by
   * the whole model, whenever the selection is passed as an object literal or
   * annotated with `satisfies`.
   * @throws {@link ResourceError} `RESOURCE_INVALID_AGGREGATE` if the selection
   * is empty or names a field or operator that cannot be aggregated, and a
   * {@link DatabaseError} on a database error.
   */
  public async aggregate<S extends AggregateSelect<ReadOne>>(
    options: AggregateOptions<ReadOne, S, Query>
  ): Promise<AggregateResponse<AggregateSelected<ReadOne, S>>> {
    const {
      select,
      filter = {} as Query,
      dateField = 'createdAt',
      from,
      to,
      step,
      safeIncrement = true
    } = options;

    const {
      fromDate,
      toDate,
      ranges: dateRanges
    } = buildAggregationPeriods(from, to, step, safeIncrement);

    const operations = mapAggregationSelect(select, this._client.name);
    checkAggregationDateField(dateField, this._client.name);

    const query = await this.queryConditions('aggregate', filter);

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
      throw this.databaseError(e);
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
   * @throws {@link ResourceError} `RESOURCE_FORBIDDEN` if the access check denies
   * the action, `RESOURCE_INVALID_RELATION` if an inline relation payload is
   * missing required fields or the relation does not accept new records, and a
   * {@link DatabaseError} on a database error, i.e. `DATABASE_UNIQUE_VIOLATION`.
   */
  public async create(data: Create): Promise<ReadOne> {
    const createdBy = createdByConnect(this._client.name);

    const restrictions = await this.applyWriteRestrictions('create', data);

    const createData = removeUndefined({
      ...data,
      ...restrictions
    });

    const access = await this.applyAccessCheck('create', createData as ReadOne);
    if (!access) {
      throw new ResourceError(
        ErrorCode.ResourceForbidden,
        `${this._client.name} create action is forbidden`,
        { model: this._client.name, action: 'create' }
      );
    }

    const sanitizedData = this.sanitizeData('create', createData);

    const connectRelations = mapRelationActions(
      this._client.name,
      'create',
      sanitizedData
    );
    const includeRelations = mapRelationInclusions(this._client.name, 'create');

    await assertLiveRelationTargets(
      this._db.client(),
      this._client.name,
      connectRelations
    );

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
      throw this.databaseError(e);
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
   * `orphanRemoval` is configured for them, the same way a delete does. The resource cache is invalidated and a
   * resource event carrying both the previous and the current state is emitted
   * after a successful update.
   *
   * @param {ResourceId} id The id of the resource to update.
   * @param {Object} data The partial data to update the resource with, including
   * any inline relation and file payloads.
   * @returns {Promise<Object>} The updated resource with its virtual fields and
   * relation counts projected.
   * @throws {@link ResourceError} `RESOURCE_NOT_FOUND` if the resource does not
   * exist or is filtered out by the read restrictions, `RESOURCE_FORBIDDEN` if
   * the access check denies the action, `RESOURCE_INVALID_RELATION` if an
   * inline relation payload is missing required fields or the relation does not
   * accept new records, `RESOURCE_DELETE_RESTRICTED` if a live record
   * references a soft deleted orphan through a restricting relation, and a
   * {@link DatabaseError} on a database error, i.e. `DATABASE_UNIQUE_VIOLATION`.
   */
  public async update(id: ResourceId, data: Update): Promise<ReadOne> {
    const { current } = await this.updateWithPrevious(id, data);

    return current;
  }

  /**
   * Deletes an existing resource by its id. The current record is loaded with
   * the read restrictions applied and checked for access before it is deleted
   * inside a single transaction.
   *
   * A model with `softDelete` enabled marks the record with the `deletedAt`
   * and `deletedById` columns instead, soft deleting its cascade as well.
   *
   * The stored files of the deleted records follow the `onResourceDeleted`, or
   * for soft deleted records the `onResourceSoftDeleted`, option of each file
   * field: kept files are marked deleted in the transaction and no longer
   * served, the others are removed once it commits. The cache of every affected
   * model is invalidated and a resource event is emitted.
   *
   * @param {ResourceId} id The id of the resource to delete.
   * @returns {Promise<Object>} The deleted resource with its virtual fields and
   * relation counts projected.
   * @throws {@link ResourceError} `RESOURCE_NOT_FOUND` if the resource does not
   * exist or is filtered out by the read restrictions, `RESOURCE_FORBIDDEN` if
   * the access check denies it, `RESOURCE_DELETE_RESTRICTED` if a restricting
   * relation still references a soft deleted resource, and a
   * {@link DatabaseError} on a database error, i.e.
   * `DATABASE_FOREIGN_KEY_VIOLATION` for a restricting relation of a removed
   * resource.
   */
  public async delete(id: ResourceId): Promise<ReadOne> {
    const restrictions = await this.applyReadRestrictions('delete', id);
    const softDelete = hasSoftDelete(injectModel(this._client.name).config);
    const includeRelations = mapRelationInclusions(this._client.name, 'delete');

    let resource: ReadOne;
    let deleted: DeletedRecords;
    try {
      [resource, deleted] = await this._db.client().$transaction(async (tx) => {
        const txModel = tx[this._client.name];

        // A soft deleted record is read with its relations up front, as a
        // database delete returns them before the cascade removes them
        const current = await txModel.findFirst({
          where: {
            id,
            ...restrictions,
            ...liveRecordFilter(this._client.name)
          },
          include: softDelete ? includeRelations : undefined
        });
        if (!current || current.id !== id) {
          throw new ResourceError(
            ErrorCode.ResourceNotFound,
            `${this._client.name} not found`,
            { model: this._client.name, id }
          );
        }

        const access = await this.applyAccessCheck('delete', current);
        if (!access) {
          throw new ResourceError(
            ErrorCode.ResourceForbidden,
            `${this._client.name} delete action is forbidden`,
            { model: this._client.name, action: 'delete' }
          );
        }

        const data = softDeleteData();

        let result: ReadOne;
        let records: AffectedRecords;
        if (softDelete) {
          records = await softDeleteCascade(tx, this._client.name, [id], data);
          const updated = await txModel.update({ where: { id }, data });
          result = { ...current, ...updated };
        } else {
          records = await cascadedRecords(tx, this._client.name, [id]);
          result = await txModel.delete({
            where: { id },
            include: includeRelations
          });
        }

        // Merged rather than spread, since a self cascade holds the same model
        mergeAffectedRecords(records, { [this._client.name]: [id] });
        const removed: DeletedRecords = softDelete
          ? { soft: records, hard: {} }
          : { soft: {}, hard: records };

        await retainDeletedFiles(tx, removed, data);
        return [result, removed];
      });
    } catch (e) {
      throw this.databaseError(e, id);
    }

    await this.cleanupDeletedRecords(deleted);

    this._events.emitResourceEvent(this._client.name, 'delete', {
      current: resource
    });

    return this.projectResource(resource);
  }

  /**
   * Updates an existing resource the same way as {@link ResourceService.update},
   * returning the state the resource had before the update along with the
   * updated one.
   *
   * @param {ResourceId} id The id of the resource to update.
   * @param {Object} data The partial data to update the resource with.
   * @returns {Promise<{ previous: Object, current: Object }>} The resource before
   * and after the update, both with their virtual fields and relation counts
   * projected.
   */
  protected async updateWithPrevious(
    id: ResourceId,
    data: Update
  ): Promise<{ previous: ReadOne; current: ReadOne }> {
    const readRestrictions = await this.applyReadRestrictions('update', {
      id,
      ...data
    });

    const writeRestrictions = await this.applyWriteRestrictions('update', {
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
    let orphans: DeletedRecords;
    try {
      [updateResource, resource, orphans] = await this._db
        .client()
        .$transaction(async (tx) => {
          const txModel = tx[this._client.name];

          const current = await txModel.findFirst({
            where: {
              id,
              ...readRestrictions,
              ...liveRecordFilter(this._client.name)
            },
            include: includeRelations
          });
          if (!current || current.id !== id) {
            throw new ResourceError(
              ErrorCode.ResourceNotFound,
              `${this._client.name} not found`,
              { model: this._client.name, id }
            );
          }

          const access = await this.applyAccessCheck('update', current);
          if (!access) {
            throw new ResourceError(
              ErrorCode.ResourceForbidden,
              `${this._client.name} update action is forbidden`,
              { model: this._client.name, action: 'update' }
            );
          }

          const setRelations = mapRelationActions(
            this._client.name,
            'update',
            sanitizedData,
            current
          );

          await assertLiveRelationTargets(tx, this._client.name, setRelations);

          // Soft deleted orphans are marked before the update reads the
          // relations back, so the response no longer holds them
          const deleteData = softDeleteData();
          const removed = await removeOrphans(
            tx,
            this._client.name,
            setRelations,
            deleteData
          );
          await retainDeletedFiles(tx, removed, deleteData);

          const updated = await txModel.update({
            where: { id },
            include: includeRelations,
            data: { ...sanitizedData, ...setRelations }
          });

          return [current, updated, removed];
        });
    } catch (e) {
      throw this.databaseError(e, id);
    }

    await this._cacheService.invalidateCache(this._client.name, 'update');
    await this.cleanupDeletedRecords(orphans);

    this._events.emitResourceEvent(this._client.name, 'update', {
      previous: updateResource,
      current: resource
    });

    return {
      previous: this.projectResource(updateResource),
      current: this.projectResource(resource)
    };
  }

  /**
   * This method should be overridden with custom logic for restricting read
   * operations on specific data for currently logged-in user and other
   * authorization rules. The returned object will be applied as a filter on
   * all actions (except create action) which will prevent unwanted data access
   * and modifications. This method can also cancel the current action by
   * throwing an error, i.e. a {@link ResourceError} with the
   * `RESOURCE_FORBIDDEN` code or an `ApplicationError` with a code of the
   * application.
   *
   * Not called for the calls run with internal access (see `withoutPolicies`).
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
   * current action by throwing an error, i.e. a {@link ResourceError} with the
   * `RESOURCE_FORBIDDEN` code or an `ApplicationError` with a code of the
   * application.
   *
   * Not called for the calls run with internal access (see `withoutPolicies`).
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
   * Not called for the calls run with internal access (see `withoutPolicies`).
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
   * Returns the read restrictions of {@link ResourceService.readRestrictions},
   * or none when the call runs with internal access (see `withoutPolicies`).
   *
   * @internal
   */
  private async applyReadRestrictions(
    action: Exclude<ActionType, 'create'>,
    data: any
  ): Promise<any> {
    return arePoliciesSkipped() ? {} : this.readRestrictions(action, data);
  }

  /**
   * Returns the write restrictions of {@link ResourceService.writeRestrictions},
   * or none when the call runs with internal access (see `withoutPolicies`).
   *
   * @internal
   */
  private async applyWriteRestrictions(
    action: 'create' | 'update',
    data: any
  ): Promise<Partial<Create & Update>> {
    return arePoliciesSkipped() ? {} : this.writeRestrictions(action, data);
  }

  /**
   * Runs the access check of {@link ResourceService.checkAccess}, which always
   * grants the access when the call runs with internal access (see
   * `withoutPolicies`).
   *
   * @internal
   */
  private async applyAccessCheck(
    action: ActionType,
    resource: ReadOne
  ): Promise<boolean> {
    return arePoliciesSkipped() || this.checkAccess(action, resource);
  }

  /**
   * Builds the database conditions of a query filter: the mapped filter, its
   * text search, the read restrictions of the action, and the conditions
   * hiding the soft deleted records.
   *
   * @internal
   */
  private async queryConditions(
    action: Exclude<ActionType, 'create'>,
    filter: Query
  ): Promise<{ AND: any[] }> {
    const restrictions = await this.applyReadRestrictions(action, filter);
    const textSearch = this.extractTextSearchQuery(filter);
    const mappedFilter = mapQueryFilter(filter, this._client.name);

    return {
      AND: [mappedFilter, textSearch, restrictions, ...this.liveFilters()]
    };
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
    const projectedResource = projectVirtualFields(
      hideDeletedRelations(resource, this._client.name),
      this._client.name
    );

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
   * Lists the conditions hiding the soft deleted resources from a query. It is
   * empty for a model that deletes its records, so its query and the cursors
   * bound to it stay the same.
   *
   * @returns {Object[]} The `deletedAt: null` condition, or no condition.
   */
  private liveFilters(): Record<string, any>[] {
    const liveFilter = liveRecordFilter(this._client.name);
    return Object.keys(liveFilter).length > 0 ? [liveFilter] : [];
  }

  /**
   * Cleans up after records were deleted, once the deleting transaction
   * commits: removes the stored files their fields do not keep, since the
   * storage cannot take part in the transaction, and invalidates the cache of
   * every model they belong to.
   *
   * @param {DeletedRecords} deleted The soft deleted and the removed records.
   */
  private async cleanupDeletedRecords(deleted: DeletedRecords): Promise<void> {
    const fileService = inject(FileService, false);
    const groups: [boolean, AffectedRecords][] = [
      [true, deleted.soft],
      [false, deleted.hard]
    ];

    for (const [softDeleted, records] of groups) {
      for (const [modelName, ids] of Object.entries(records)) {
        await fileService?.deleteResourcesFiles(modelName, ids, softDeleted);
        await this._cacheService.invalidateCache(modelName, 'delete');
      }
    }
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

  /**
   * The model delegate of the current transaction, or of the connection outside
   * of one, resolved per call.
   *
   * @internal
   */
  private get _client(): ResourceClient {
    return this._db.client()[this._modelKey];
  }

  /**
   * Translates the error of a database operation, a record removed after it
   * was read, i.e. by a concurrent delete, being one not found.
   *
   * @internal
   */
  private databaseError(error: unknown, id?: ResourceId): unknown {
    const translated = toDatabaseError(error, this._client.name);
    if (
      isAppweaverError(translated) &&
      translated.is(ErrorCode.DatabaseRecordNotFound)
    ) {
      return new ResourceError(
        ErrorCode.ResourceNotFound,
        `${this._client.name} not found`,
        { model: this._client.name, id },
        { cause: translated.cause }
      );
    }
    return translated;
  }
}
