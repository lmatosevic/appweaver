import path from 'node:path';
import {
  ActionType,
  AggregateResponse,
  AggregateSelect,
  AggregateSelected,
  capitalize,
  CONFIG,
  Ctor,
  isFunction,
  isPlainObject,
  logger,
  QueryResponse,
  QuerySort,
  Resource,
  RESOURCE_NAME,
  RESOURCE_SERVICE_TYPE,
  RESOURCE_TYPE,
  ResourceData,
  ResourceId,
  ResourceServiceConfig
} from '@appweaver/common';
import { define, injectPolicy } from '../context';
import { ResourceService } from '../resource';
import { currentAuthUser } from '../security';

export function createService<T = any, C = any, U = any>(
  config: ResourceServiceConfig<T, C, U>,
  override: boolean = false
): Ctor<ResourceService<T, T, C, U>> {
  const name = capitalize(
    config.modelName || path.basename(path.dirname(__dirname))
  );

  class Service extends ResourceService<T, T, C, U> {
    [CONFIG] = config;
    [RESOURCE_NAME] = name;
    [RESOURCE_TYPE] = RESOURCE_SERVICE_TYPE;

    constructor() {
      super(name);
    }

    async find(id: ResourceId): Promise<any> {
      await config.beforeFind?.(id);

      const result = await super.find(id);

      await config.afterFind?.(result);

      return result;
    }

    async query(
      filter: any = {} as any,
      page: number = 1,
      size: number = 50,
      sort: QuerySort<T> = '-createdAt',
      cursor?: string | null,
      totalCount: boolean = true
    ): Promise<QueryResponse<any>> {
      await config.beforeQuery?.(filter, page, size, sort, cursor, totalCount);

      const result = await super.query(
        filter,
        page,
        size,
        sort,
        cursor,
        totalCount
      );

      await config.afterQuery?.(result);

      return result;
    }

    async aggregate<S extends AggregateSelect<T>>(
      filter: any = {} as any,
      select: S,
      dateField: string = 'createdAt',
      from?: string,
      to?: string,
      step?: number,
      safeIncrement: boolean = true
    ): Promise<AggregateResponse<AggregateSelected<T, S>>> {
      await config.beforeAggregate?.(
        filter,
        select,
        dateField,
        from,
        to,
        step,
        safeIncrement
      );

      const result = await super.aggregate(
        filter,
        select,
        dateField,
        from,
        to,
        step,
        safeIncrement
      );

      // The hook is declared once for the model, so it takes the response of
      // every selection, of which this one holds a subset of the fields
      await config.afterAggregate?.(result as AggregateResponse<T>);

      return result;
    }

    async create(data: any): Promise<any> {
      await config.beforeCreate?.(data);

      const result = await super.create(data);

      await config.afterCreate?.(result);

      return result;
    }

    async update(id: ResourceId, data: any): Promise<any> {
      await config.beforeUpdate?.(id, data);

      const result = await super.update(id, data);

      await config.afterUpdate?.(result);

      return result;
    }

    async delete(id: ResourceId): Promise<any> {
      await config.beforeDelete?.(id);

      const result = await super.delete(id);

      await config.afterDelete?.(result);

      return result;
    }

    protected textSearchQuery(searchText: string): any {
      if (isFunction(config.textSearch)) {
        return config.textSearch(searchText);
      }

      if (isPlainObject(config.textSearch)) {
        return config.textSearch;
      }

      return super.textSearchQuery(searchText);
    }

    protected async readRestrictions(
      action: Exclude<ActionType, 'create'>,
      data: any
    ): Promise<any> {
      const policy = injectPolicy(name, false);

      if (policy?.readRestrictions) {
        const user = currentAuthUser() ?? null;
        return policy.readRestrictions(user, data, action) ?? {};
      }

      return super.readRestrictions(action, data);
    }

    protected async writeRestrictions(
      action: 'create' | 'update',
      data: any
    ): Promise<
      Partial<ResourceData<Resource> & Partial<ResourceData<Resource>>>
    > {
      const policy = injectPolicy(name, false);

      if (policy?.writeRestrictions) {
        const user = currentAuthUser() ?? null;
        return policy.writeRestrictions(user, data, action) ?? {};
      }

      return super.writeRestrictions(action, data);
    }

    protected async checkAccess(
      action: ActionType,
      resource: T
    ): Promise<boolean> {
      const policy = injectPolicy(name, false);

      if (policy?.checkAccess) {
        const user = currentAuthUser() ?? null;
        return policy.checkAccess(user, resource, action);
      }

      return super.checkAccess(action, resource);
    }
  }

  Object.defineProperty(Service, 'name', {
    value: `${name}Service`,
    configurable: true
  });

  Service[CONFIG] = config;
  Service[RESOURCE_NAME] = name;
  Service[RESOURCE_TYPE] = RESOURCE_SERVICE_TYPE;

  logger.debug({ modelName: config.modelName }, 'Created resource service');

  define(Service, undefined, override ? 'override' : undefined);

  return Service;
}
