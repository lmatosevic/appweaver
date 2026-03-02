import { setTimeout } from 'node:timers/promises';
import { parse, stringify } from 'flatted';
import { config, HealthCheckResult, Memory, uuid } from '@appweaver/common';

type StorageEntry = {
  value: string;
  expiresAt?: number;
};

type LockEntry = {
  value: string;
  expiresAt: number;
};

export class InMemory extends Memory {
  /** @internal */
  private readonly _storage: Record<string, StorageEntry> = {};
  /** @internal */
  private readonly _locks: Record<string, LockEntry> = {};
  /** @internal */
  private _expirationInterval?: NodeJS.Timeout;

  public async connect(): Promise<void> {
    this._expirationInterval = setInterval(() => {
      this.cleanupExpired();
    }, config.MEMORY_EXPIRATION_INTERVAL);
  }

  public async disconnect(): Promise<void> {
    if (this._expirationInterval) {
      clearInterval(this._expirationInterval);
      this._expirationInterval = undefined;
    }
  }

  public async getValue<T = any>(key: string): Promise<T | null> {
    const entry = this._storage[key];

    if (!entry) {
      return null;
    }

    // Check if expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      delete this._storage[key];
      return null;
    }

    return parse(entry.value) as T;
  }

  public async putValue(
    key: string,
    value: any,
    expireMs?: number
  ): Promise<boolean> {
    const jsonValue = stringify(value);
    const expiresAt = expireMs ? Date.now() + expireMs : undefined;

    this._storage[key] = {
      value: jsonValue,
      expiresAt
    };

    return true;
  }

  public async removeValue(key: string): Promise<boolean> {
    const existed = key in this._storage;
    delete this._storage[key];
    return existed;
  }

  public async removeEntries(query: string): Promise<number> {
    const keys = await this.findKeys(query);
    let count = 0;

    for (const key of keys) {
      if (await this.removeValue(key)) {
        count++;
      }
    }

    return count;
  }

  public async findKeys(pattern: string = '*'): Promise<Set<string>> {
    const keys = Object.keys(this._storage);
    const matchingKeys = new Set<string>();

    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);

    for (const key of keys) {
      const entry = this._storage[key];
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        delete this._storage[key];
        continue;
      }

      if (regex.test(key)) {
        matchingKeys.add(key);
      }
    }

    return matchingKeys;
  }

  public async lock(
    resource: string,
    lockConfig: {
      expireMs?: number;
      retryCount?: number;
      retryDelay?: number;
    } = {}
  ): Promise<{ release: () => Promise<boolean> }> {
    const expireMs = lockConfig.expireMs ?? 5000;
    const retryCount = lockConfig.retryCount ?? 10;
    const retryDelay = lockConfig.retryDelay ?? 200;

    const resourceKey = `lock:${resource}`;
    const lockValue = uuid();
    let retries = 0;

    do {
      // Try to acquire lock (NX semantics - only set if not exists)
      const existingLock = this._locks[resourceKey];

      // Check if the existing lock is expired
      if (existingLock && Date.now() > existingLock.expiresAt) {
        delete this._locks[resourceKey];
      }

      // Try to acquire
      if (!this._locks[resourceKey]) {
        this._locks[resourceKey] = {
          value: lockValue,
          expiresAt: Date.now() + expireMs
        };

        return {
          release: async () => {
            // Only release if the lock value matches
            const currentLock = this._locks[resourceKey];
            if (currentLock && currentLock.value === lockValue) {
              delete this._locks[resourceKey];
              return true;
            }
            return false;
          }
        };
      }

      await setTimeout(retryDelay);
      retries++;
    } while (retries < retryCount);

    throw new Error('Unable to acquire lock on requested resource');
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    return { success: true };
  }

  private cleanupExpired(): void {
    const now = Date.now();

    // Cleanup expired storage entries
    for (const key in this._storage) {
      const entry = this._storage[key];
      if (entry.expiresAt && now > entry.expiresAt) {
        delete this._storage[key];
      }
    }

    // Clean up expired locks
    for (const key in this._locks) {
      const lock = this._locks[key];
      if (now > lock.expiresAt) {
        delete this._locks[key];
      }
    }
  }
}
