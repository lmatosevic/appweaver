import {
  ActionType,
  Cache,
  CacheInvalidationStrategy,
  config,
  logger,
  makeHash,
  RelationOutput
} from '@appweaver/common';
import { stringify } from 'flatted';
import { context, inject, injectModel } from '../context';
import { AuthUser, ResourceModel } from '../types';

export class CacheService {
  /** @internal */
  private readonly _cache = inject(Cache);

  get cache(): Cache {
    return this._cache;
  }

  public async invalidateCache(
    modelName: string,
    action: Extract<ActionType, 'create' | 'update' | 'delete'>
  ): Promise<void> {
    if (config.CACHE_ENABLED) {
      logger.debug(`Expiring ${modelName} resource cache on ${action} action`);

      let invalidation: Promise<number> | undefined;
      switch (config.CACHE_INVALIDATION_STRATEGY) {
        case CacheInvalidationStrategy.ExpireRelated:
          invalidation = this._cache.expire(`*!${modelName}!*:inv`);
          break;
        case CacheInvalidationStrategy.ExpireAll:
          invalidation = this._cache.expire(`*:inv`);
          break;
      }

      if (invalidation) {
        if (config.CACHE_INVALIDATION_DEFERRED) {
          void invalidation.catch((error) => {
            logger.error(error, 'Cache invalidation error');
          });
        } else {
          await invalidation;
        }
      }
    }
  }

  public buildCacheKey(data: {
    baseKey: string;
    method?: string;
    url?: string;
    body?: string;
    modelName?: string;
    relations?: string[];
    skipInvalidation?: boolean;
    authUser?: AuthUser;
  }): string {
    const userPrefix = data.authUser ? data.authUser.id : '';
    const bodyHash = data.body ? makeHash(stringify(data.body)) : '';

    // Extract model relations based on route cache config so they can be used to
    // evict cache entries when related data changes
    const allRelations: string[] = [];
    if (data.relations?.[0] === '*' || data.modelName) {
      if (data.modelName) {
        // Add all relations from a specified model
        const model = injectModel(data.modelName, false);
        if (model) {
          allRelations.push(...this.collectAllRelations(model));
        }
      } else {
        // Add all defined models as relations
        for (const model of context.resource.models.values()) {
          for (const relation of Object.values(model.config.relations ?? {})) {
            allRelations.push(relation.model);
          }
        }
      }
    } else if (data.relations && data.relations.length > 1) {
      allRelations.push(...data.relations);
    }

    // Create a list of unique relation names
    const relations = [...new Set(allRelations)];
    const relationList = relations.length > 0 ? `!${relations.join('!')}!` : '';

    const invalidateSuffix = data.skipInvalidation ? '' : 'inv';

    return [
      data.baseKey,
      userPrefix,
      data.method,
      data.url,
      bodyHash,
      relationList,
      invalidateSuffix
    ]
      .filter((v) => !!v)
      .join(':');
  }

  private collectAllRelations(model: ResourceModel): string[] {
    const relations: string[] = [];

    // Add the model itself as a relation
    relations.push(model.name);

    // Traverse top-level relations (using their own output config)
    for (const relation of Object.values(model.config.relations ?? {})) {
      const outputType = relation.output?.type;

      if (outputType === 'none') {
        continue;
      }

      relations.push(relation.model);

      // Traverse nested includes (if any)
      if (relation.output?.include) {
        this.traverseInclude(relation.output.include, model, relations);
      }
    }

    return relations;
  }

  private traverseInclude(
    include: Record<string, RelationOutput>,
    model: ResourceModel,
    acc: string[]
  ): void {
    const relations = model.config.relations ?? {};

    for (const [relKey, includeConfig] of Object.entries(include)) {
      const type = includeConfig.type;

      if (type === 'none') {
        continue;
      }

      const relationDef = relations[relKey];
      if (!relationDef) {
        continue;
      }

      acc.push(relationDef.model);

      // If this include has nested includes, recurse
      if (includeConfig.include) {
        this.traverseInclude(includeConfig.include, model, acc);
      }
    }
  }
}
