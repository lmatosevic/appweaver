import path from 'node:path';
import {
  ActionType,
  AggregateResponse,
  AggregateSelect,
  capitalize,
  isFunction,
  isObject,
  logger,
  QueryResponse,
  ResourceServiceConfig
} from '@appweaver/common';
import { define, injectPolicy } from '../context';
import { ResourceService } from '../resource';
import { Resource, ResourceData } from '../types';
import {
  RESOURCE_NAME,
  RESOURCE_SERVICE_TYPE,
  RESOURCE_TYPE
} from '../constants';

export function createService(config: ResourceServiceConfig): ResourceService {
  const name = capitalize(
    config.modelName || path.basename(path.dirname(__dirname))
  );

  class Service extends ResourceService {
    async find(id: number): Promise<any> {
      await config.beforeFind?.(id);

      const result = await super.find(id);

      await config.afterFind?.(result);

      return result;
    }

    async query(
      filter: any = {} as any,
      page: number = 1,
      size: number = 50,
      sort: string = '-createdAt,id'
    ): Promise<QueryResponse<any>> {
      await config.beforeQuery?.(filter, page, size, sort);

      const result = await super.query(filter, page, size, sort);

      await config.afterQuery?.(result);

      return result;
    }

    async aggregate(
      filter: any = {} as any,
      select: AggregateSelect<any>,
      dateField: string = 'createdAt',
      from?: string,
      to?: string,
      step?: number,
      safeIncrement: boolean = true
    ): Promise<AggregateResponse<any>> {
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

      await config.afterAggregate?.(result);

      return result;
    }

    async create(data: any): Promise<any> {
      await config.beforeCreate?.(data);

      const result = await super.create(data);

      await config.afterCreate?.(result);

      return result;
    }

    async update(id: number, data: any): Promise<any> {
      await config.beforeUpdate?.(id, data);

      const result = await super.update(id, data);

      await config.afterUpdate?.(result);

      return result;
    }

    async delete(id: number): Promise<any> {
      await config.beforeDelete?.(id);

      const result = await super.delete(id);

      await config.afterDelete?.(result);

      return result;
    }

    protected textSearchQuery(searchText: string): any {
      if (isFunction(config.textSearch)) {
        return config.textSearch(searchText);
      }

      if (isObject(config.textSearch)) {
        return config.textSearch;
      }

      return super.textSearchQuery(searchText);
    }

    protected async readRestrictions(
      action: Exclude<ActionType, 'create'>,
      data: any
    ): Promise<any> {
      const policy = injectPolicy(name);

      if (policy.readRestrictions) {
        return policy.readRestrictions(action, data);
      }

      return super.readRestrictions(action, data);
    }

    protected async writeRestrictions(
      action: 'create' | 'update',
      data: any
    ): Promise<
      Partial<ResourceData<Resource> & Partial<ResourceData<Resource>>>
    > {
      const policy = injectPolicy(name);

      if (policy.writeRestrictions) {
        return policy.writeRestrictions(action, data);
      }

      return super.writeRestrictions(action, data);
    }

    protected async checkAccess(
      action: ActionType,
      resource: Resource
    ): Promise<boolean> {
      const policy = injectPolicy(name);

      if (policy?.checkAccess) {
        return policy.checkAccess(action, resource);
      }

      return super.checkAccess(action, resource);
    }
  }

  Object.defineProperty(Service, 'name', {
    value: `${name}Service`,
    configurable: true
  });

  const resourceService = new Service(name);

  resourceService[RESOURCE_NAME] = name;
  resourceService[RESOURCE_TYPE] = RESOURCE_SERVICE_TYPE;

  logger.debug({ modelName: config.modelName }, 'Created resource service');

  define(resourceService);

  return resourceService;
}
