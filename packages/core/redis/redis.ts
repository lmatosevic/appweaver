import { Redis as RedisClient, RedisOptions } from 'ioredis';
import { parse, stringify } from 'flatted';
import { config } from '@appweaver/common';
import { HealthCheck, HealthCheckResult } from '../health';
import { RedisLock } from './redis-lock';

export class Redis implements HealthCheck {
  private readonly options: RedisOptions;
  private readonly client: RedisClient;

  constructor() {
    this.options = this.parseConnectionUrl(config.REDIS_URL);
    this.client = this.createClient({ lazyConnect: true });
  }

  public createClient(extraOptions: RedisOptions = {}): RedisClient {
    return new RedisClient({
      ...this.options,
      ...extraOptions
    });
  }

  public async connect(): Promise<void> {
    await this.client.connect();
  }

  public async disconnect(): Promise<void> {
    await this.client.quit();
  }

  public async getValue<T = any>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? (parse(value) as T) : null;
  }

  public async putValue(
    key: string,
    value: any,
    expireMs?: number
  ): Promise<boolean> {
    const jsonValue = stringify(value);
    const result = expireMs
      ? await this.client.set(key, jsonValue, 'PX', expireMs)
      : await this.client.set(key, jsonValue);
    return result === 'OK';
  }

  public async removeValue(key: string): Promise<boolean> {
    const result = await this.client.del(key);
    return result > 0;
  }

  public async removeEntries(query: string): Promise<number> {
    const keys = await this.findKeys(query);
    return this.client.del(...keys);
  }

  public async findKeys(pattern: string = '*'): Promise<Set<string>> {
    return new Promise((resolve) => {
      const stream = this.client.scanStream({
        match: pattern,
        count: 10000
      });

      const keysSet = new Set<string>();

      stream.on('data', (keys) => {
        stream.pause();
        keys.forEach((key: string) => keysSet.add(key));
        stream.resume();
      });

      stream.on('end', () => {
        resolve(keysSet);
      });
    });
  }

  public async lock(
    resource: string,
    lockConfig: {
      expireMs?: number;
      retryCount?: number;
      retryDelay?: number;
    } = {}
  ): Promise<{ release: () => Promise<boolean> }> {
    const redisLock = new RedisLock(
      this.client,
      resource,
      lockConfig.expireMs,
      lockConfig.retryCount,
      lockConfig.retryDelay
    );
    return await redisLock.lock();
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    try {
      const result = await this.client.ping();
      return { success: result === 'PONG' };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  private parseConnectionUrl(url: string): RedisOptions {
    const urlPattern =
      /redis:\/\/(?:(.*?)(?::(.*?))?@)?(.*?):(\d+)(?:\/(\d+))?/;
    const match = url.match(urlPattern);

    if (!match) {
      return { host: 'localhost', port: 6379 };
    }

    const username = match[2] ? match[1] : undefined;
    const password = match[2] || match[1];
    const host = match[3] || 'localhost';
    const port = parseInt(match[4], 10) || 6379;
    const db = match[5] ? parseInt(match[5], 10) : undefined;

    return { username, password, host, port, db };
  }
}

const redis = new Redis();

export { redis };
