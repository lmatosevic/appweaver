import {
  ActionType,
  AggregateOptions,
  AggregateResponse,
  AggregateSelect,
  AggregateSelected,
  capitalize,
  CONFIG,
  Ctor,
  isFunction,
  isPlainObject,
  logger,
  ModelName,
  QueryOptions,
  QueryResponse,
  RegistryType,
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
import { bindTextSearch } from '../resource/utils';
import { currentAuthUser } from '../security';

/**
 * Creates the resource service of a model, running the configured hooks around its operations and applying the
 * policy of the model. Once the types are generated, the model, create, and update types of the hooks are inferred
 * from the model name.
 *
 * @param {ResourceServiceConfig} config - The service configuration with the model name, hooks, and text search.
 * @param {boolean} [override=false] - Whether to replace a service already defined for the model.
 * @return {Ctor<ResourceService>} The created service class, defined in the application context.
 */
export function createService<
  N extends ModelName,
  T = RegistryType<N, 'model'>,
  C = RegistryType<N, 'create'>,
  U = RegistryType<N, 'update'>
>(
  config: ResourceServiceConfig<T, C, U> & { modelName: N },
  override: boolean = false
): Ctor<ResourceService<T, T, C, U>> {
  const name = capitalize(config.modelName);

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

    async query(options: QueryOptions<T> = {}): Promise<QueryResponse<any>> {
      await config.beforeQuery?.(options);

      const result = await super.query(options);

      await config.afterQuery?.(result);

      return result;
    }

    async aggregate<S extends AggregateSelect<T>>(
      options: AggregateOptions<T, S>
    ): Promise<AggregateResponse<AggregateSelected<T, S>>> {
      await config.beforeAggregate?.(options);

      const result = await super.aggregate(options);

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

      const { previous, current } = await this.updateWithPrevious(id, data);

      await config.afterUpdate?.(current, previous);

      return current;
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
        return bindTextSearch(config.textSearch, searchText);
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
        return (await policy.readRestrictions(user, data, action)) ?? {};
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
        return (await policy.writeRestrictions(user, data, action)) ?? {};
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
