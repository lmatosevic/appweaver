import {
  addDays,
  addHours,
  addMinutes,
  addMonths,
  addSeconds,
  addYears,
  differenceInMonths,
  differenceInSeconds,
  differenceInYears,
  parseISO,
  subDays
} from 'date-fns';
import {
  ActionType,
  AggregateResponse,
  AggregateSelect,
  AggregateValue,
  countFieldName,
  Database,
  defaultScalarValue,
  Events,
  extractResourceName,
  extractSchemaProperties,
  FileField,
  IResourceService,
  isArray,
  isCountField,
  isObject,
  isPlainObject,
  OutputType,
  PeriodIncrementFn,
  pickProperties,
  QueryFilter,
  QueryResponse,
  RelationField,
  removeUndefined,
  Resource,
  ResourceClient,
  ResourceData,
  setValue,
  uncapitalize
} from '@appweaver/common';
import { inject, injectModel } from '../context';
import { mapQueryFilter, projectVirtualFields } from '../utils';
import { currentAuthUser } from '../security';
import { PrismaDatabase } from '../database';
import { CacheService } from '../cache';
import { HttpError } from '../errors';

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
   * @param {number} id The id of the resource to find.
   * @returns {Promise<Object>} The found resource with its virtual fields and
   * relation counts projected.
   * @throws {@link HttpError} 404 if the resource does not exist or is filtered
   * out by the read restrictions, 403 if the access check denies it, and 500 on
   * a database error.
   */
  public async find(id: number): Promise<ReadOne> {
    const restrictions = await this.readRestrictions('find', id);
    const includeRelations = this.mapRelationInclusions('find');

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
   * @param {string} [sort] The comma-separated list of fields to sort by, where a
   * field prefixed with `-` is sorted in descending order (i.e. `-createdAt,id`).
   * Nested relation fields are supported with a dot notation.
   * @returns {Promise<QueryResponse<Object>>} The paged query response containing
   * the returned resources, the count of the returned items and the total count
   * of matching resources.
   * @throws {@link HttpError} 500 on a database error.
   */
  public async query(
    filter: Query = {} as any,
    page: number = 1,
    size: number = 50,
    sort: string = '-createdAt,id'
  ): Promise<QueryResponse<ReadMany>> {
    const restrictions = await this.readRestrictions('query', filter);
    const textSearch = this.extractTextSearchQuery(filter);
    const mappedFilter = mapQueryFilter(filter, this._client.name);

    const query = { AND: [mappedFilter, textSearch, restrictions] };
    const includeRelations = this.mapRelationInclusions('query');
    const orderBy = this.mapSortValues(sort);

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
   * per field (i.e. count, sum, avg, min, max).
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
   * date of its period.
   * @throws {@link HttpError} 500 on a database error.
   */
  public async aggregate(
    filter: Query = {} as any,
    select: AggregateSelect<ReadOne>,
    dateField: string = 'createdAt',
    from?: string,
    to?: string,
    step?: number,
    safeIncrement: boolean = true
  ): Promise<AggregateResponse<ReadOne>> {
    const toDate = parseISO(to ?? new Date().toISOString());
    const fromDate = from ? parseISO(from) : subDays(toDate, 7);
    const iterator = this.makeAggregationIterator(
      fromDate,
      toDate,
      step,
      safeIncrement
    );

    const dateRanges: { from: Date; to: Date; median: Date }[] = [];

    let currentDate = parseISO(fromDate.toISOString());
    while (currentDate < toDate) {
      const date = currentDate;
      const median = iterator.addPeriod(date, (iterator.step - 1) / 2);
      currentDate = iterator.addPeriod(currentDate, iterator.step);
      dateRanges.push({ from: date, to: currentDate, median });
    }

    const aggregateOperations = this.mapAggregationValues(select);

    const restrictions = await this.readRestrictions('aggregate', filter);
    const textSearch = this.extractTextSearchQuery(filter);
    const mappedFilter = mapQueryFilter(filter, this._client.name);

    const query = { AND: [mappedFilter, textSearch, restrictions] };

    let total: Record<string, Record<string, number>> = {};
    let items: Record<string, Record<string, number>>[] = [];
    try {
      [total, items] = await this._db.client().$transaction(async (tx) => {
        const txModel = tx[this._client.name];

        const overall = await txModel.aggregate({
          ...aggregateOperations,
          where: {
            AND: [
              query,
              {
                [dateField]: {
                  gte: fromDate,
                  lt: toDate
                }
              }
            ]
          }
        });

        // Skip executing the same query if only one range value is generated
        if (dateRanges.length === 1) {
          return [overall, [overall]];
        }

        const ranges = await Promise.all(
          dateRanges.map((dateRange) =>
            txModel.aggregate({
              ...aggregateOperations,
              where: {
                AND: [
                  query,
                  {
                    [dateField]: {
                      gte: dateRange.from,
                      lt: dateRange.to
                    }
                  }
                ]
              }
            })
          )
        );

        return [overall, ranges];
      });
    } catch (e) {
      throw new HttpError('Error on results aggregation', 500, e);
    }

    return {
      total: this.mapAggregationValues(total, true),
      items: items.map((item, index) => ({
        date: dateRanges[index].median,
        result: this.mapAggregationValues(item, true)
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
    const createdBy = this.createdByConnect();

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

    const connectRelations = this.mapRelationActions('create', sanitizedData);
    const includeRelations = this.mapRelationInclusions('create');

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
   * @param {number} id The id of the resource to update.
   * @param {Object} data The partial data to update the resource with, including
   * any inline relation and file payloads.
   * @returns {Promise<Object>} The updated resource with its virtual fields and
   * relation counts projected.
   * @throws {@link HttpError} 404 if the resource does not exist or is filtered
   * out by the read restrictions, 403 if the access check denies the action, 400
   * if an inline relation payload is missing required fields or the relation
   * does not accept new records, and 500 on a database error.
   */
  public async update(id: number, data: Update): Promise<ReadOne> {
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

    const includeRelations = this.mapRelationInclusions('update');

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

          const setRelations = this.mapRelationActions(
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
   * @param {number} id The id of the resource to delete.
   * @returns {Promise<Object>} The deleted resource with its virtual fields and
   * relation counts projected.
   * @throws {@link HttpError} 404 if the resource does not exist or is filtered
   * out by the read restrictions, 403 if the access check denies the action, and
   * 500 on a database error.
   */
  public async delete(id: number): Promise<ReadOne> {
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

        const includeRelations = this.mapRelationInclusions('delete');

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
   * @param {Object|number} data The passed data to the called function can be
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
   * Maps a comma-separated sort expression to the ordered list of Prisma
   * `orderBy` entries. A `-` prefix selects a descending order, dot notation
   * paths are expanded into nested objects, relation count fields are rewritten
   * to their `_count` form, and the default `createdAt` sort is dropped when the
   * model does not audit that field.
   *
   * @param {string} sort The comma-separated list of fields to sort by, where a
   * field prefixed with `-` is sorted in descending order and a dot notation path
   * targets a nested relation field (i.e. `-createdAt,author.name`).
   * @returns {Object[]} The list of single-property `orderBy` entries, in the
   * order the fields were listed, each mapping a field path to `asc` or `desc`.
   */
  private mapSortValues(sort: string): any[] {
    const sortMap = {};

    const resourceModel = injectModel(this._client.name);

    const parts = sort.split(',');

    for (const part of parts) {
      let path = part.trim();
      const order = path.startsWith('-') ? 'desc' : 'asc';
      path = path.replace(/[-+]/g, '');

      // Skip the default sort by createdAt field if not configured
      if (
        resourceModel.config.audit?.createdAt === false &&
        path === 'createdAt'
      ) {
        continue;
      }

      // Map relations count field sort order.
      if (isCountField(path)) {
        path = path.replace('Count', '._count');
      }

      setValue(sortMap, path, order);
    }

    return Object.entries(sortMap).map(([key, value]) => ({ [key]: value }));
  }

  /**
   * Converts between the aggregation selection format of this service and the
   * Prisma aggregation format by swapping the field and operator nesting. With
   * `isOutput` disabled, a `{ field: { count: true } }` selection becomes the
   * `{ _count: { field: true } }` Prisma input, and with it enabled a
   * `{ _count: { field: 1 } }` Prisma result becomes the
   * `{ count: { field: 1 } }` response value.
   *
   * @param {Object} select The values to convert, keyed by field name with the
   * operators nested inside when mapping an input selection, or keyed by the
   * prefixed Prisma operator name with the fields nested inside when mapping an
   * output result.
   * @param {boolean} [isOutput] Whether the values are a Prisma aggregation result
   * that is mapped back to the response format. When false, an input selection is
   * mapped to the Prisma aggregation arguments.
   * @returns {AggregateValue<Object>} The aggregation values with the field and
   * operator nesting swapped, with the operator names prefixed with `_` for an
   * input and unprefixed for an output.
   */
  private mapAggregationValues(
    select: AggregateSelect<ReadOne> | Record<string, Record<string, number>>,
    isOutput: boolean = false
  ): AggregateValue<ReadOne> {
    const aggregationMap = {};

    for (const field in select) {
      const operators = select[field];

      for (const operator in operators) {
        const value = operators[operator];
        const path = isOutput
          ? `${operator}.${field.substring(1)}`
          : `_${operator}.${field}`;

        setValue(aggregationMap, path, value);
      }
    }

    return aggregationMap;
  }

  /**
   * Builds the period iterator used to split an aggregation date range into
   * equally sized periods. When no step is provided, a step of one is used with
   * the time unit derived from the range length, and the returned increment
   * function compensates for daylight saving time offset changes so every period
   * keeps the time zone offset of its start date.
   *
   * @param {Date} fromDate The start of the aggregated date range.
   * @param {Date} toDate The end of the aggregated date range.
   * @param {number} [step] The size of a single period in units of the selected
   * time unit. If not provided, a step of one is used with the time unit derived
   * from the range length (seconds up to a minute, minutes up to an hour, hours up
   * to a day, days up to a month, months up to a year, and years beyond that).
   * @param {boolean} [safeIncrement] Whether the increments use the derived time
   * unit. When false, the step is interpreted in seconds.
   * @returns {{addPeriod: PeriodIncrementFn, step: number}} The iterator holding
   * the resolved step amount and the `addPeriod` function that adds a number of
   * periods to a date while preserving the time zone offset of that date.
   */
  private makeAggregationIterator(
    fromDate: Date,
    toDate: Date,
    step?: number,
    safeIncrement: boolean = true
  ): { addPeriod: PeriodIncrementFn; step: number } {
    let stepAmount = step;
    let incrementFn: PeriodIncrementFn = addSeconds;

    if (!stepAmount) {
      const diffInSeconds = differenceInSeconds(toDate, fromDate);
      const diffInMonths = differenceInMonths(toDate, fromDate);
      const diffInYears = differenceInYears(toDate, fromDate);

      stepAmount = 1;

      // 1-second step if the difference is less than or equal to 1 minute
      if (diffInSeconds <= 60) {
        incrementFn = addSeconds;
      }
      // 1-minute step if the difference is less than or equal to 1 hour
      else if (diffInSeconds <= 3600) {
        incrementFn = addMinutes;
      }
      // 1-hour step if the difference is less than or equal to 1 day
      else if (diffInSeconds <= 86400) {
        incrementFn = addHours;
      }
      // 1-day step if the difference is less than or equal to 1 month
      else if (diffInMonths <= 1) {
        incrementFn = addDays;
      }
      // 1-month step if the difference is less than or equal to 1 year
      else if (diffInYears <= 1) {
        incrementFn = addMonths;
      }
      // 1-year step if the difference is equal to 1 year or more
      else {
        incrementFn = addYears;
      }
    }

    // A higher-order function that adjusts date increments to account for
    // changes in daylight saving time (DST). When incrementing dates in time
    // zones that observe DST, this function ensures that the resulting date
    // remains consistent with the original date's time zone offset.
    const dstAgnosticFn = (fn: PeriodIncrementFn) => {
      return (date: Date, amount: number): Date => {
        const endDate = fn(date, amount);
        return addMinutes(
          endDate,
          date.getTimezoneOffset() - endDate.getTimezoneOffset()
        );
      };
    };

    return {
      addPeriod: dstAgnosticFn(safeIncrement ? incrementFn : addSeconds),
      step: stepAmount
    };
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

  /**
   * Builds the Prisma `include` clause for the relation and file fields of the
   * resource model. A field is included when its configured output type allows
   * it for the given action, or always when no action is specified, and the
   * relations configured with an output count contribute to the `_count`
   * selection instead.
   *
   * @param {ActionType} [action] The action the inclusions are built for, matched
   * against the configured output type of every field. When omitted, all fields
   * whose output type is not `none` are included.
   * @param {string} [resourceName] The name of the model whose relations are
   * included. Defaults to the model of this service.
   * @returns {Object} The `include` clause mapping each included field to `true` or
   * to its own nested `include` clause, extended with a `_count` selection for the
   * relations configured with an output count.
   */
  private mapRelationInclusions(
    action?: ActionType,
    resourceName?: string
  ): Record<string, any> {
    const inclusion: Record<string, any> = {};

    const resourceModel = injectModel(resourceName ?? this._client.name);
    const relationConfig = resourceModel.config.relations;
    const fileConfig = resourceModel.config.files;

    const relationModelProps = extractSchemaProperties(
      resourceModel.relationsModel
    );
    const fileModelProps = extractSchemaProperties(resourceModel.filesModel);

    // Add relation and file fields to the inclusion map if the include type is
    // satisfied or the requested action is not specified. Also, add the count
    // aggregation actions for relations if configured.
    for (const key of Object.keys({
      ...relationModelProps,
      ...fileModelProps
    })) {
      const relationField: RelationField | FileField | undefined =
        relationConfig?.[key] || fileConfig?.[key];

      if (relationField?.output?.count) {
        inclusion._count = inclusion._count ?? { select: {} };
        inclusion._count.select[key] = true;
      }

      // Check if the relation should be included based on the output type
      if (this.shouldIncludeRelation(relationField?.output?.type, action)) {
        inclusion[key] = this.buildNestedInclusion(
          relationField as RelationField,
          action
        );
      }
    }

    return inclusion;
  }

  /**
   * Resolves the inclusion value of a single relation field by walking its
   * configured nested output includes recursively. Returns `true` when the
   * relation has no nested includes to apply for the given action, or a nested
   * `include` clause otherwise.
   *
   * @param {RelationField} relationField The configuration of the relation whose
   * inclusion value is resolved, read from its `output.include` property.
   * @param {ActionType} [action] The action the inclusions are built for, matched
   * against the configured output type of every nested relation.
   * @returns {boolean|Object} True if the relation has no nested relations to
   * include for the given action, or the nested `include` clause otherwise.
   */
  private buildNestedInclusion(
    relationField: RelationField,
    action?: ActionType
  ): boolean | { include: Record<string, any> } {
    const nestedIncludeConfig = relationField?.output?.include;

    if (!nestedIncludeConfig || Object.keys(nestedIncludeConfig).length === 0) {
      return true;
    }

    const nestedInclusion: Record<string, any> = {};

    for (const [nestedKey, nestedOutput] of Object.entries(
      nestedIncludeConfig
    )) {
      // Check if the nested relation should be included
      if (this.shouldIncludeRelation(nestedOutput?.type, action)) {
        // Recursively build nested inclusions
        nestedInclusion[nestedKey] = this.buildNestedInclusion(
          { output: nestedOutput } as RelationField,
          action
        );
      }
    }

    return Object.keys(nestedInclusion).length > 0
      ? { include: nestedInclusion }
      : true;
  }

  /**
   * Decides whether a relation with the given configured output type is included
   * for the given action. The `none` type is never included, the `single` type is
   * excluded from the query action, and the `multiple` type is only included on
   * the query action or when no action is specified.
   *
   * @param {OutputType} [outputType] The configured output type of the relation.
   * When omitted, the relation is included for every action.
   * @param {ActionType} [action] The action the relation would be included for.
   * When omitted, every output type except `none` is included.
   * @returns {boolean} True if the relation should be included, false otherwise.
   */
  private shouldIncludeRelation(
    outputType?: OutputType,
    action?: ActionType
  ): boolean {
    if (outputType === 'none') {
      return false;
    }
    if (outputType === 'single' && action === 'query') {
      return false;
    }
    return !(outputType === 'multiple' && action && action !== 'query');
  }

  /**
   * Maps the relation and file fields of a write payload to the Prisma nested
   * write actions. Bare key values and arrays of them are normalized to objects
   * first, then every item is classified: items with an id and additional data
   * become inline updates when the parent action is an update and inline updates
   * are enabled for the relation, items with only an id are connected, and items
   * without an id are created inline or matched through a connect-or-create when
   * `input.uniqueKey` is configured. On an update action, the items of the
   * current record that are absent from the new value, as well as the relations
   * set to null, are disconnected, or deleted when `orphanRemoval` is configured.
   * Relations that were not loaded on the current record are left untouched.
   *
   * @param {'create'|'update'} action The write action the relation actions are
   * mapped for. Inline updates and the removal of the relations absent from the new
   * value are only applied on an update action.
   * @param {Object} data The sanitized write payload whose relation and file fields
   * are mapped. The non-relation fields are skipped, except for the null values of
   * the array scalar fields, which are mapped to an empty array on an update
   * action and to undefined on a create action.
   * @param {Object} [currentData] The currently stored record with its relations
   * loaded, required on an update action to determine which relations to disconnect
   * or delete.
   * @returns {Object} The nested write clause per relation field, mapping each one
   * to its `connect`, `create`, `update`, `connectOrCreate`, `disconnect` and
   * `delete` actions, or to undefined for the relations no action can be applied
   * to.
   * @throws {@link HttpError} 400 if an inline create payload is missing required
   * fields, or if the relation accepts no new records and an id was not provided.
   */
  private mapRelationActions(
    action: 'create' | 'update',
    data: any,
    currentData?: any
  ): Record<
    string,
    Partial<{
      connect: any;
      create: any;
      update: any;
      connectOrCreate: any;
      disconnect: any;
      delete: any;
    }>
  > {
    const relations = {};

    const resourceModel = injectModel(this._client.name);
    const readModel = resourceModel.readModel;
    const relationsModel = resourceModel.relationsModel;
    const relationsConfig = resourceModel.config.relations;

    for (const key in data) {
      let value = data[key];

      const relationSchema = extractSchemaProperties(relationsModel, key);
      if (!relationSchema) {
        // Set empty array or undefined value for null array type fields
        if (value === null) {
          if (extractSchemaProperties(readModel, key)?.type === 'array') {
            relations[key] = action === 'update' ? [] : undefined;
          } else if (action === 'create') {
            relations[key] = undefined;
          }
        }

        // Skip mapping for non-relation fields
        continue;
      }

      const config: RelationField | undefined = relationsConfig?.[key];
      // The unique key is only used to match existing records for the
      // connect-or-create action; connect and inline update always use the id
      const uniqueKey = config?.input?.allowCreate
        ? config?.input?.uniqueKey || 'id'
        : 'id';
      const isArrayType = relationSchema.type === 'array';

      // Normalize array values to single values if a value type is not an array
      if (!isArrayType && isArray(value)) {
        value = value[0];
      }

      // Set null values to undefined value for create actions. On update action
      // they will be returned as disconnected relations.
      if (action === 'create' && value === null) {
        relations[key] = undefined;
        continue;
      }

      // Normalize plain key values or arrays to object values
      if (isArrayType) {
        if (isArray(value) && !isPlainObject(value[0])) {
          value = value.map((v: any) => ({
            [uniqueKey]: v
          }));
        }
      } else if (!isObject(value)) {
        // Only bare key values are wrapped. The loose object check keeps
        // null values untouched, so they still map to a disconnect action.
        value = { [uniqueKey]: value };
      }

      // Classify every relation input item into its relation write action:
      // items with an id and additional data become inline updates (on parent
      // update requests with inline updates enabled), items with only an id are
      // connected, and items without an id are created inline or matched with
      // connect-or-create, both of which require `allowCreate`
      if (value) {
        const items: any[] = isArrayType && isArray(value) ? value : [value];
        const createdBy = this.createdByConnect(config?.model);

        const actions: Record<string, any[]> = {
          connect: [],
          update: [],
          create: [],
          connectOrCreate: []
        };

        for (const item of items) {
          if (!isPlainObject(item)) {
            continue;
          }

          if (item.id !== undefined && item.id !== null) {
            const { id, ...itemData } = item;
            const updateData = this.relationWriteData(
              config?.model,
              'update',
              itemData
            );
            if (
              action === 'update' &&
              config?.input?.allowUpdate &&
              Object.keys(updateData).length > 0
            ) {
              actions.update.push({ where: { id }, data: updateData });
            } else {
              actions.connect.push({ id });
            }
          } else if (!config?.input?.allowCreate) {
            // Without inline creation the related record must already exist,
            // so it is created through its own endpoint first
            throw new HttpError(
              `${this._client.name} relation '${key}' does not accept new records, an id is required`,
              400
            );
          } else {
            const createData = this.relationWriteData(
              config?.model,
              'create',
              item
            );
            const missingFields = this.missingRelationFields(
              config?.model,
              createData
            );
            if (missingFields.length > 0) {
              throw new HttpError(
                `${this._client.name} relation '${key}' is missing required fields: ${missingFields.join(', ')}`,
                400
              );
            }

            // A unique key matches an existing record before a new one is created
            if (config?.input?.uniqueKey) {
              actions.connectOrCreate.push({
                where: { [uniqueKey]: item[uniqueKey] },
                create: { ...createData, createdBy }
              });
            } else {
              actions.create.push({ ...createData, createdBy });
            }
          }
        }

        const relationActions = {};
        for (const [actionName, actionItems] of Object.entries(actions)) {
          if (actionItems.length > 0) {
            relationActions[actionName] = isArrayType
              ? actionItems
              : actionItems[0];
          }
        }

        if (Object.keys(relationActions).length > 0) {
          relations[key] = relationActions;
        }
      }

      // Map relation disconnects if keys are no longer present or the new
      // value is null. Delete relations if orphanRemoval is set to true.
      // Relations that are not set on the current resource are left untouched,
      // so no relation action is applied for them.
      if (action === 'update') {
        const currentValue = currentData[key];
        const removalMethod = config?.orphanRemoval ? 'delete' : 'disconnect';
        if (currentValue && isArrayType) {
          const newValueKeys = value?.map((v: any) => v[uniqueKey]) ?? [];
          const currentValueKeys = currentValue
            .filter((v: any) => newValueKeys.indexOf(v[uniqueKey]) === -1)
            .map((v: any) => ({
              [uniqueKey]: v[uniqueKey]
            }));
          if (currentValueKeys.length > 0) {
            relations[key] = {
              [removalMethod]: currentValueKeys,
              ...(relations[key] ?? {})
            };
          }
        } else if (currentValue && value === null) {
          relations[key] = {
            [removalMethod]: { [uniqueKey]: currentValue[uniqueKey] },
            ...(relations[key] ?? {})
          };
        } else if (currentValue === undefined) {
          // The relation was not loaded on the current record, so no relation
          // action can be applied safely
          relations[key] = undefined;
        }
      }
    }

    return relations;
  }

  /**
   * Restricts an inline relation payload to the fields the related model
   * accepts for the given action. The request schema accepts the create and the
   * update fields together, since the properties it does not declare are
   * stripped before the request reaches the service, so the configured field
   * restrictions of the related model are applied here instead.
   *
   * @param {string} [resourceName] The name of the related model whose field
   * restrictions are applied. When omitted, the payload is returned unchanged.
   * @param {'create' | 'update'} action The write action the payload is restricted
   * for, selecting either the relation create or the relation update model of the
   * related resource.
   * @param {Object} data The inline relation payload to restrict.
   * @returns {Object} The payload reduced to the fields the related model accepts
   * for the action, excluding the `id` field, or the payload unchanged if the
   * related model declares no fields for it.
   */
  private relationWriteData(
    resourceName: string | undefined,
    action: 'create' | 'update',
    data: any
  ): any {
    const resourceModel = resourceName
      ? injectModel(resourceName, false)
      : undefined;

    const writeModel =
      action === 'create'
        ? resourceModel?.relationCreateModel
        : resourceModel?.relationUpdateModel;

    const properties = extractSchemaProperties(writeModel);
    if (!properties) {
      return data;
    }

    return pickProperties(
      data,
      Object.keys(properties).filter((name) => name !== 'id')
    );
  }

  /**
   * Lists the fields the related model requires on creation that the given
   * inline relation payload does not provide.
   *
   * @param {string} [resourceName] The name of the related model whose required
   * fields are checked. When omitted, no fields are reported as missing.
   * @param {Object} data The inline relation payload to check.
   * @returns {string[]} The names of the fields the related model requires on
   * creation that the payload leaves undefined, or an empty list if the related
   * model declares no create schema.
   */
  private missingRelationFields(
    resourceName: string | undefined,
    data: any
  ): string[] {
    const resourceModel = resourceName
      ? injectModel(resourceName, false)
      : undefined;

    const createModel = resourceModel?.relationCreateModel;
    if (!createModel) {
      return [];
    }

    const schema = createModel['$ref']
      ? createModel['$defs']?.[createModel['$ref']]
      : createModel;

    return (schema?.required ?? []).filter(
      (name: string) => data[name] === undefined
    );
  }

  /**
   * Builds the connect action for the `createdBy` audit relation of a resource,
   * pointing at the currently authenticated user. Returns undefined when the
   * model does not audit the `createdById` field or when no user is authenticated.
   *
   * @param {string} [resourceName] The name of the model the audit relation is
   * built for. Defaults to the model of this service.
   * @returns {{connect: {id: number}} | undefined} The connect action pointing
   * at the id of the currently authenticated user, or undefined if the model
   * does not audit the `createdById` field or no user is authenticated.
   */
  private createdByConnect(
    resourceName?: string
  ): { connect: { id: number } } | undefined {
    const resourceModel = injectModel(resourceName ?? this._client.name, false);
    if (resourceModel?.config.audit?.createdById === false) {
      return undefined;
    }

    const currentUser = currentAuthUser();
    return currentUser
      ? {
          connect: {
            id: currentUser.id
          }
        }
      : undefined;
  }
}
