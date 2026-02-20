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
  FileField,
  isArray,
  isFunction,
  isObject,
  PeriodIncrementFn,
  QueryResponse,
  RelationField,
  removeUndefined,
  setValue,
  uncapitalize
} from '@appweaver/common';
import { db } from '../database';
import { events } from '../events';
import { context } from '../context';
import { currentIdentity } from '../security';
import { HttpError } from '../errors';
import {
  countFieldName,
  defaultScalarValue,
  extractResourceName,
  extractSchemaProperties
} from '../utils';
import { Resource, ResourceModel, ResourceOmit } from '../types';

export abstract class ResourceService<
  ReadOne = Resource,
  ReadMany = Resource,
  Create = ResourceOmit<Resource>,
  Update = Partial<ResourceOmit<Resource>>,
  Query = any
> {
  private readonly _model: ResourceModel;

  constructor(public readonly modelName: string) {
    this._model = db.client[uncapitalize(modelName)];
    if (!this._model) {
      throw new Error(
        `ResourceService initialized with invalid model: ${modelName}`
      );
    }
  }

  public get model(): ResourceModel {
    return this._model;
  }

  public async find(id: number): Promise<ReadOne> {
    const restrictions = await this.readRestrictions('find', id);
    const includeRelations = this.mapRelationInclusions('find');

    let resource: ReadOne;
    try {
      resource = await this._model.findFirst({
        where: { id, ...restrictions },
        include: includeRelations
      });
    } catch (e) {
      throw new HttpError(`${this._model.name} find error`, 500, e);
    }

    if (!resource || (resource as any).id !== id) {
      throw new HttpError(`${this._model.name} data not found`, 404);
    }

    const access = await this.checkAccess('find', resource);
    if (!access) {
      throw new HttpError(`${this._model.name} data access is forbidden`, 403);
    }

    events.emitResourceEvent(this._model.name, 'find', { current: resource });

    return this.projectResource(resource);
  }

  public async query(
    filter: Query = {} as any,
    page = 1,
    size = 50,
    sort = '-createdAt,id'
  ): Promise<QueryResponse<ReadMany>> {
    const restrictions = await this.readRestrictions('query', filter);
    const textSearch = this.extractTextSearchQuery(filter);
    const mappedFilter = this.mapQueryFilter(filter);

    const query = { AND: [mappedFilter, textSearch, restrictions] };
    const includeRelations = this.mapRelationInclusions('query');
    const orderBy = this.mapSortValues(sort);

    let resources: ReadMany[];
    let totalCount: number;
    try {
      [resources, totalCount] = await db.client.$transaction([
        this._model.findMany({
          where: { ...query },
          include: includeRelations,
          skip: (page - 1) * size,
          take: size,
          orderBy
        }),
        this._model.count({
          where: { ...query }
        })
      ]);
    } catch (e) {
      throw new HttpError(`${this._model.name} query error`, 500, e);
    }

    events.emitResourceEvent(this._model.name, 'query', { current: resources });

    return {
      resultCount: resources.length,
      totalCount,
      items: resources.map((resource) => this.projectResource(resource))
    };
  }

  public async aggregate(
    filter: Query = {} as any,
    select: AggregateSelect<ReadOne>,
    dateField: string = 'createdAt',
    from?: string,
    to?: string,
    step?: number,
    safeIncrement = true
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
    const mappedFilter = this.mapQueryFilter(filter);

    const query = { AND: [mappedFilter, textSearch, restrictions] };

    let total: Record<string, Record<string, number>> = {};
    let items: Record<string, Record<string, number>>[] = [];
    try {
      [total, items] = await db.client.$transaction(async (tx) => {
        const txModel = tx[this._model.name];

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

        // Skip executing the same query if only one range value is generated.
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
        `${this._model.name} create action is forbidden`,
        403
      );
    }

    const sanitizedData = this.sanitizeData(createData);

    const connectRelations = this.mapRelationActions('create', sanitizedData);
    const includeRelations = this.mapRelationInclusions('create');

    let resource: ReadOne;
    try {
      resource = await this._model.create({
        data: {
          ...sanitizedData,
          ...connectRelations,
          createdBy
        },
        include: includeRelations
      });
    } catch (e) {
      throw new HttpError(`${this._model.name} create error`, 500, e);
    }

    events.emitResourceEvent(this._model.name, 'create', { current: resource });

    return this.projectResource(resource);
  }

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

    const sanitizedData = this.sanitizeData(updateData);

    const includeRelations = this.mapRelationInclusions('update');

    let updateResource: ReadOne;
    let resource: ReadOne;
    try {
      [updateResource, resource] = await db.client.$transaction(async (tx) => {
        const txModel = tx[this._model.name];

        const current = await txModel.findFirst({
          where: { id, ...readRestrictions },
          include: includeRelations
        });
        if (!current || current.id !== id) {
          throw new HttpError(`${this._model.name} data not found`, 404);
        }

        const access = await this.checkAccess('update', current);
        if (!access) {
          throw new HttpError(
            `${this._model.name} update action is forbidden`,
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
      throw new HttpError(`${this._model.name} update error`, 500, e);
    }

    events.emitResourceEvent(this._model.name, 'update', {
      previous: updateResource,
      current: resource
    });

    return this.projectResource(resource);
  }

  public async delete(id: number): Promise<ReadOne> {
    const restrictions = await this.readRestrictions('delete', id);

    let resource: ReadOne;
    try {
      resource = await db.client.$transaction(async (tx) => {
        const txModel = tx[this._model.name];

        const current = await txModel.findFirst({
          where: { id, ...restrictions }
        });
        if (!current || current.id !== id) {
          throw new HttpError(`${this._model.name} data not found`, 404);
        }

        const access = await this.checkAccess('delete', current);
        if (!access) {
          throw new HttpError(
            `${this._model.name} delete action is forbidden`,
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
      throw new HttpError(`${this._model.name} delete error`, 500, e);
    }

    events.emitResourceEvent(this._model.name, 'delete', { current: resource });

    return this.projectResource(resource);
  }

  /**
   * This method should be overridden with custom logic for restricting read
   * operations on specific data for currently logged-in user and other
   * authorization rules. The returned object will be applied as a filter on
   * all actions (except create action) which will prevent unwanted data access
   * and modifications. This method can also cancel current action by throwing
   * an error, recommended is {@link HttpError } with appropriate HTTP error
   * code.
   *
   * @param action The called action method on this service (find, query,
   * aggregate, update, or delete)
   * @param data The passed data to the called function, can be number or
   * object. If the data is a type of number, then it represents the resource
   * id, otherwise it depends on the action and can be one of the following:
   *
   * - query and aggregate -> filter object
   * - update -> combined id and the data object (i.e. { id, ...data })
   *
   * For other actions (find and delete) it represents the resource id.
   * @return The filter containing additional query restrictions.
   */
  protected async readRestrictions(
    action: Exclude<ActionType, 'create'>,
    data: any
  ): Promise<Query> {
    return {} as Query;
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
   * @param action The called action method on this service (create or update)
   * @param data The passed data to the called function, which should be an
   * object representing the resource data to be created or updated. For
   * update operations, this object will also include the resource ID.
   *
   * @return A partial object containing additional data restrictions to be
   * applied, or an empty object if no restrictions are necessary.
   */
  protected async writeRestrictions(
    action: Extract<ActionType, 'create' | 'update'>,
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
   * @param action The called action method on this service (find, query,
   * aggregate, create, update, or delete)
   * @param resource The resource object that is being check for access.
   * @returns True if the access for resource is granted, false otherwise.
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
   * @param searchText The text string used for searching resources.
   * @returns A query object that represents the conditions for the text
   * search operation. This will be used by the database query methods to
   * retrieve matching resources.
   */
  protected textSearchQuery(searchText: string): Query {
    return {} as Query;
  }

  private extractTextSearchQuery(filter: any): Query {
    if (filter.searchText) {
      const searchQuery = this.textSearchQuery(filter.searchText);
      delete filter.searchText;
      return searchQuery;
    }
    return {} as Query;
  }

  private mapSortValues(sort: string): any[] {
    const sortMap = {};

    const parts = sort.split(',');

    for (const part of parts) {
      let path = part.trim();
      const order = path.startsWith('-') ? 'desc' : 'asc';
      path = path.replace(/[-+]/g, '');

      // Map relations count field sort order.
      if (path.endsWith('Count')) {
        path = path.replace('Count', '._count');
      }

      setValue(sortMap, path, order);
    }

    return Object.entries(sortMap).map(([key, value]) => ({ [key]: value }));
  }

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

      // 1 second step if the difference is less than or equal to 1 minute.
      if (diffInSeconds <= 60) {
        incrementFn = addSeconds;
      }
      // 1-minute step if the difference is less than or equal to 1 hour.
      else if (diffInSeconds <= 3600) {
        incrementFn = addMinutes;
      }
      // 1-hour step if the difference is less than or equal to 1 day.
      else if (diffInSeconds <= 86400) {
        incrementFn = addHours;
      }
      // 1-day step if the difference is less than or equal to 1 month.
      else if (diffInMonths <= 1) {
        incrementFn = addDays;
      }
      // 1-month step if the difference is less than or equal to 1 year.
      else if (diffInYears <= 1) {
        incrementFn = addMonths;
      }
      // 1-year step if the difference is equal to 1 year or more.
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

  private projectResource<T>(resource: T): T {
    const projectedResource = this.projectVirtualFields(resource);

    if (!isObject(projectedResource['_count'])) {
      return projectedResource;
    }

    // Create new relations count properties on the resource object.
    for (const [key, count] of Object.entries(projectedResource['_count'])) {
      projectedResource[countFieldName(key)] = count;
    }

    delete projectedResource['_count'];

    return projectedResource;
  }

  private projectVirtualFields<T>(resource: T, resourceName?: string): T {
    const projectedVirtual = { ...resource };

    const resourceModel = context.models[resourceName ?? this._model.name];
    const relationsModel = resourceModel?.relationsModel;
    const filesModel = resourceModel?.filesModel;

    // Set output or default value for virtual fields
    for (const [fieldName, virtual] of Object.entries(
      resourceModel.config?.virtual ?? {}
    )) {
      const outputValue = virtual.output?.value;
      if (isFunction(outputValue)) {
        projectedVirtual[fieldName] = outputValue(projectedVirtual);
      } else if (outputValue) {
        projectedVirtual[fieldName] = outputValue;
      } else if (virtual.required !== false) {
        projectedVirtual[fieldName] =
          virtual.default ?? defaultScalarValue(virtual);
      }
    }

    // Recursively project virtual fields for nested relational objects.
    for (const key in projectedVirtual) {
      const value = projectedVirtual[key];

      const relationSchema = extractSchemaProperties(relationsModel, key);
      const fileSchema = extractSchemaProperties(filesModel, key);

      if (isObject(value) || (isArray(value) && isObject(value[0]))) {
        const resourceName = extractResourceName(relationSchema ?? fileSchema);
        if (resourceName) {
          projectedVirtual[key] = isArray(value)
            ? (value.map((item: any) =>
                this.projectVirtualFields(item, resourceName)
              ) as any)
            : this.projectVirtualFields(value, resourceName);
        }
      }
    }

    return projectedVirtual;
  }

  private sanitizeData<T>(data: T, resourceName?: string): T {
    const sanitizedData = { ...data };

    const resourceModel = context.models[resourceName ?? this._model.name];
    const relationsModel = resourceModel?.relationsModel;
    const filesModel = resourceModel?.filesModel;

    // Delete virtual fields from data object to avoid database errors.
    for (const fieldName of Object.keys(resourceModel.config?.virtual ?? {})) {
      delete sanitizedData[fieldName];
    }

    // Map default values for hidden scalars if a property is required without
    // a provided default value.
    for (const [fieldName, scalar] of Object.entries(
      resourceModel.config?.scalars ?? {}
    )) {
      if (
        scalar.hidden &&
        scalar.required !== false &&
        scalar.default === undefined
      ) {
        sanitizedData[fieldName] = defaultScalarValue(scalar);
      }
    }

    // Recursively sanitize nested objects and arrays of objects.
    for (const key in sanitizedData) {
      const value = sanitizedData[key];

      const relationSchema = extractSchemaProperties(relationsModel, key);
      const fileSchema = extractSchemaProperties(filesModel, key);

      if (isObject(value) || (isArray(value) && isObject(value[0]))) {
        const resourceName = extractResourceName(relationSchema ?? fileSchema);
        if (resourceName) {
          sanitizedData[key] = isArray(value)
            ? (value.map((item: any) =>
                this.sanitizeData(item, resourceName)
              ) as any)
            : this.sanitizeData(value, resourceName);
        }
      }
    }

    return sanitizedData;
  }

  private mapQueryFilter(filter: any, resourceName?: string): any {
    const queryFilter = {};

    const resourceModel = context.models[resourceName ?? this._model.name];
    const readModel = resourceModel?.readModel;
    const relationsModel = resourceModel?.relationsModel;
    const filesModel = resourceModel?.filesModel;

    for (const key in filter) {
      const value = filter[key];

      const readSchema = extractSchemaProperties(readModel, key);
      const relationSchema = extractSchemaProperties(relationsModel, key);
      const fileSchema = extractSchemaProperties(filesModel, key);

      const isArrayType =
        readSchema?.type === 'array' ||
        relationSchema?.type === 'array' ||
        fileSchema?.type === 'array';

      const isArrayValue = isArray(value);

      // Recursively map nested objects and handle arrays of objects.
      if (isObject(value) || (isArrayValue && isObject(value[0]))) {
        const resourceName = extractResourceName(relationSchema ?? fileSchema);
        if (resourceName) {
          queryFilter[key] = isArrayValue
            ? value.map((item: any) => this.mapQueryFilter(item, resourceName))
            : this.mapQueryFilter(value, resourceName);
        }
      }
      // Map ID values for both single and array types of relationships.
      else if (relationSchema || fileSchema) {
        const queryId = { id: isArrayValue ? { in: value } : value };
        queryFilter[key] = isArrayType ? { some: queryId } : queryId;
      }
      // Map fields without relationships, supporting array types.
      else if (readSchema) {
        if (isArrayType) {
          queryFilter[key] = isArrayValue ? { hasSome: value } : { has: value };
        } else if (isArrayValue) {
          // For date and numeric types, apply range filtering with inclusive
          // intervals.
          if (
            value.length > 0 &&
            value.length <= 2 &&
            (['number', 'integer'].includes(readSchema.type) ||
              ['date', 'date-time'].includes(readSchema.format))
          ) {
            queryFilter[key] = {
              gte: value[0],
              lte: value[1]
            };
          }
          // Map array values for inclusion checks.
          else {
            queryFilter[key] = { in: value };
          }
        }
      }

      // If no query filter was defined, assign the original value.
      if (queryFilter[key] === undefined) {
        queryFilter[key] = value;
      }
    }

    return queryFilter;
  }

  private mapRelationInclusions(action?: ActionType): Record<string, boolean> {
    const inclusion: Record<string, any> = {};

    const resourceModel = context.models[this._model.name];
    const relationConfig = resourceModel?.config.relations;
    const fileConfig = resourceModel?.config.files;

    const relationModelProps =
      extractSchemaProperties(resourceModel?.relationsModel) ?? {};
    const fileModelProps =
      extractSchemaProperties(resourceModel?.filesModel) ?? {};

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

      if (
        relationField?.output?.type === 'none' ||
        (relationField?.output?.type === 'single' && action === 'query') ||
        (relationField?.output?.type === 'multiple' &&
          action &&
          action !== 'query')
      ) {
        continue;
      }
      inclusion[key] = true;
    }

    return inclusion;
  }

  private mapRelationActions(
    action: Extract<ActionType, 'create' | 'update'>,
    data: any,
    currentData?: any
  ): Record<
    string,
    Partial<{ connect: any[]; connectOrCreate: any[]; disconnect: any[] }>
  > {
    const relations = {};

    const createdBy = this.createdByConnect();

    const resourceModel = context.models[this._model.name];
    const readModel = resourceModel?.readModel;
    const relationsModel = resourceModel?.relationsModel;
    const relationsConfig = resourceModel?.config.relations;

    for (const key in data) {
      let value = data[key];

      const relationSchema = extractSchemaProperties(relationsModel, key);
      if (!relationSchema) {
        // Set empty array or undefined value for null array type fields.
        if (value === null) {
          if (extractSchemaProperties(readModel, key)?.type === 'array') {
            relations[key] = action === 'update' ? [] : undefined;
          } else if (action === 'create') {
            relations[key] = undefined;
          }
        }

        // Skip mapping for non-relation fields.
        continue;
      }

      const config: RelationField | undefined = relationsConfig?.[key];
      const uniqueKey = config?.input?.uniqueKey || 'id';
      const isArrayType = relationSchema.type === 'array';

      // Normalize array values to single values if a value type is not an array.
      if (!isArrayType && isArray(value)) {
        value = value[0];
      }

      // Set null values to undefined value for create actions. On update action
      // they will be returned as disconnected relations.
      if (action === 'create' && value === null) {
        relations[key] = undefined;
        continue;
      }

      // Normalize plain unique key values or arrays to object values.
      if (isArrayType) {
        if (isArray(value) && !isObject([0])) {
          value = value.map((v: any) => ({
            [uniqueKey]: v
          }));
        }
      } else {
        if (!isObject(value)) {
          value = { [uniqueKey]: value };
        }
      }

      // Map relation connections with an option to create a non-existing entity.
      if (config?.createIfNotExists && value) {
        if (isArrayType) {
          relations[key] = {
            connectOrCreate: value.map((v: any) => ({
              where: v[uniqueKey] ? { [uniqueKey]: v[uniqueKey] } : { id: 0 },
              create: { ...v, createdBy, id: undefined }
            }))
          };
        } else {
          relations[key] = {
            connectOrCreate: {
              where: value[uniqueKey]
                ? { [uniqueKey]: value[uniqueKey] }
                : { id: 0 },
              create: { ...value, createdBy, id: undefined }
            }
          };
        }
      } else if (value) {
        if (isArrayType && isArray(value)) {
          relations[key] = {
            connect: value.map((v: any) => ({ [uniqueKey]: v[uniqueKey] }))
          };
        } else {
          relations[key] = { connect: { [uniqueKey]: value[uniqueKey] } };
        }
      }

      // Map relation disconnects if unique keys are no longer present or the
      // new value is null. Delete relations if orphanRemoval is set to true.
      // Also, do not create a disconnect action if the currentValue is already
      // null.
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
        } else if (!currentValue) {
          relations[key] = undefined;
        }
      }
    }

    return relations;
  }

  private createdByConnect(): { connect: { id: number } } | undefined {
    const currentUser = currentIdentity();
    return currentUser
      ? {
          connect: {
            id: currentUser.id
          }
        }
      : undefined;
  }
}
