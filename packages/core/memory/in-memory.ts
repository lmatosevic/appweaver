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
  private readonly _storage: Map<string, StorageEntry> = new Map();
  /** @internal */
  private readonly _locks: Map<string, LockEntry> = new Map();
  /** @internal */
  private _approximatedSize: number = 0;

  public async onInit(): Promise<void> {
    await this.connect();
  }

  public async onDestroy(): Promise<void> {
    await this.disconnect();
  }

  public async connect(): Promise<void> {
    // no-op
  }

  public async disconnect(): Promise<void> {
    // no-op
  }

  public createClient(): undefined {
    // no-op
  }

  public async getValue<T = any>(key: string): Promise<T | null> {
    const entry = this._storage.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      await this.cleanupExpired();
      return null;
    }

    return parse(entry.value) as T;
  }

  public async putValue(
    key: string,
    value: any,
    expireMs?: number
  ): Promise<boolean> {
    await this.cleanupExpired();

    const jsonValue = stringify(value);
    const expiresAt = expireMs ? Date.now() + expireMs : undefined;

    this._storage.set(key, {
      value: jsonValue,
      expiresAt
    });

    this._approximatedSize += Buffer.byteLength(jsonValue, 'utf8');

    // If memory max size is reached, remove entries from start until the size is
    // below the configured value
    if (config.MEMORY_MAX_SIZE_BYTES) {
      while (this._approximatedSize > config.MEMORY_MAX_SIZE_BYTES) {
        await this.removeValue(this._storage.keys()[0]);
      }
    }

    return true;
  }

  public async hasKey(key: string): Promise<boolean> {
    return this._storage.has(key);
  }

  public async removeValue(key: string): Promise<boolean> {
    const jsonValue = await this.getValue(key);
    if (!jsonValue) {
      return false;
    }

    const deleted = this._storage.delete(key);

    this._approximatedSize -= Buffer.byteLength(jsonValue, 'utf8');
    if (this._approximatedSize < 0) {
      this._approximatedSize = 0;
    }

    return deleted;
  }

  public async removeEntries(query: string): Promise<number> {
    const keys = await this.findKeys(query);

    const removeActions = Array.from(keys).map((key) => this.removeValue(key));
    const results = await Promise.allSettled(removeActions);

    return results.filter((r) => r.status === 'fulfilled' && r.value).length;
  }

  public async findKeys(pattern: string = '*'): Promise<Set<string>> {
    const matchingKeys = new Set<string>();

    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);

    for (const key of this._storage.keys()) {
      const entry = this._storage.get(key);
      if (entry && entry.expiresAt && entry.expiresAt < Date.now()) {
        this._storage.delete(key);
        continue;
      }

      if (regex.test(key)) {
        matchingKeys.add(key);
      }
    }

    return matchingKeys;
  }

  public async valueSizeBytes(key: string): Promise<number | null> {
    const entry = this._storage.get(key);
    return entry ? Buffer.byteLength(entry.value, 'utf8') : null;
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
      const existingLock = this._locks.get(resourceKey);

      // Check if the existing lock is expired
      if (existingLock && existingLock.expiresAt < Date.now()) {
        this._locks.delete(resourceKey);
      }

      // Try to acquire
      if (!this._locks.has(resourceKey)) {
        this._locks.set(resourceKey, {
          value: lockValue,
          expiresAt: Date.now() + expireMs
        });

        return {
          release: async () => {
            // Only release if the lock value matches
            const currentLock = this._locks.get(resourceKey);
            if (currentLock && currentLock.value === lockValue) {
              this._locks.delete(resourceKey);
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

  private async cleanupExpired(): Promise<void> {
    const now = Date.now();

    // Clean up expired storage entries
    for (const key in this._storage.keys()) {
      const entry = this._storage.get(key);
      if (entry && entry.expiresAt && entry.expiresAt < now) {
        await this.removeValue(key);
      }
    }

    // Clean up expired locks
    for (const key in this._locks.keys()) {
      const lock = this._locks.get(key);
      if (lock && lock.expiresAt < now) {
        this._locks.delete(key);
      }
    }
  }
}
