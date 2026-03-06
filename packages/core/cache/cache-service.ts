import {
  ActionType,
  Cache,
  CacheInvalidationStrategy,
  config,
  logger
} from '@appweaver/common';
import { inject } from '../context';

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

      let invalidation: Promise<void> | undefined;
      switch (config.CACHE_INVALIDATION_STRATEGY) {
        case CacheInvalidationStrategy.ExpireRelated:
          invalidation = this.invalidateRelated(modelName);
          break;
        case CacheInvalidationStrategy.ExpireAll:
          invalidation = this.invalidateAll();
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

  public async invalidateRelated(modelName: string): Promise<void> {
    await this._cache.expire(`*!${modelName}!*`);
  }

  public async invalidateAll(): Promise<void> {
    await this._cache.expire(`*`);
  }
}
