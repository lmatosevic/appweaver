import {
  HealthCheckConfig,
  HealthCheckResult,
  IHealthCheck,
  OnDestroy,
  OnInit
} from '../interfaces';
import { HEALTH_CHECK, LIFECYCLE } from '../constants';

export abstract class Memory implements IHealthCheck, OnInit, OnDestroy {
  static [LIFECYCLE] = true;
  static [HEALTH_CHECK] = true;

  abstract onInit(): Promise<void>;

  abstract onDestroy(): Promise<void>;

  /** Establishes the underlying connection. */
  abstract connect(): Promise<void>;

  /** Closes the underlying connection. */
  abstract disconnect(): Promise<void>;

  /**
   * Creates and returns the underlying client.
   *
   * @param {Object} options - Provider-specific client options.
   */
  abstract createClient(options?: any): any;

  /**
   * Retrieves a value by key.
   *
   * @param {string} key - The key to look up.
   * @returns The stored value, or `null` if not found.
   */
  abstract getValue<T = any>(key: string): Promise<T | null>;

  /**
   * Stores a value under the given key.
   *
   * @param {string} key - The key to store under.
   * @param {Object} value - The value to store.
   * @param {number} expireMs - Optional TTL in milliseconds.
   * @returns `true` if stored successfully, `false` otherwise.
   */
  abstract putValue(
    key: string,
    value: any,
    expireMs?: number
  ): Promise<boolean>;

  /**
   * Checks whether a key exists.
   *
   * @param {string} key - The key to check.
   */
  abstract hasKey(key: string): Promise<boolean>;

  /**
   * Removes the value for the given key.
   *
   * @param {string} key - The key to remove.
   * @returns `true` if the key was removed, `false` otherwise.
   */
  abstract removeValue(key: string): Promise<boolean>;

  /**
   * Removes all entries matching the query pattern.
   *
   * @param {string} query - A pattern or query string.
   * @returns The number of entries removed.
   */
  abstract removeEntries(query: string): Promise<number>;

  /**
   * Returns all keys matching the given pattern.
   *
   * @param {string} pattern - Optional glob/pattern to filter keys.
   */
  abstract findKeys(pattern?: string): Promise<Set<string>>;

  /**
   * Calculates the size of a value associated with the provided key in bytes.
   *
   * @param {string} key - The key whose corresponding value's size in bytes needs to be determined.
   * @return {Promise<number>} A promise that resolves to the size of the value in bytes.
   */
  abstract valueSizeBytes(key: string): Promise<number | null>;

  /**
   * Acquires a lock on a specified resource with optional configuration for expiration and retries.
   *
   * @param {string} resource - The name or identifier of the resource to be locked.
   * @param {Object} [lockConfig] - Optional configuration for the lock behavior.
   * @param {number} [lockConfig.expireMs] - The time, in milliseconds, before the lock automatically expires.
   * @param {number} [lockConfig.retryCount] - The number of times to retry acquiring the lock if it is unavailable.
   * @param {number} [lockConfig.retryDelay] - The delay, in milliseconds, between retry attempts.
   * @return {Promise<{release: () => Promise<boolean>}>} A promise that resolves to an object containing a function to
   * release the lock.
   */
  abstract lock(
    resource: string,
    lockConfig?: {
      expireMs?: number;
      retryCount?: number;
      retryDelay?: number;
    }
  ): Promise<{ release: () => Promise<boolean> }>;

  abstract checkHealth(): Promise<HealthCheckResult>;

  public checkHealthConfig(): HealthCheckConfig {
    return { name: 'memory' };
  }
}
