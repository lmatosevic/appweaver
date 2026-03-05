import { setTimeout } from 'node:timers/promises';
import { Redis as RedisClient, RedisOptions } from 'ioredis';
import { parse, stringify } from 'flatted';
import {
  config,
  HealthCheckResult,
  Redis as CommonRedis,
  uuid
} from '@appweaver/common';

export class Redis extends CommonRedis<RedisOptions, RedisClient> {
  /** @internal */
  private readonly _options: RedisOptions;
  /** @internal */
  private readonly _client: RedisClient;

  constructor() {
    super();
    this._options = this.parseConnectionUrl(config.REDIS_URL);
    this._client = this.createClient({ lazyConnect: true });
  }

  public createClient(options: RedisOptions = {}): RedisClient {
    return new RedisClient({
      ...this._options,
      ...options
    });
  }

  public async connect(): Promise<void> {
    await this._client.connect();
  }

  public async disconnect(): Promise<void> {
    await this._client.quit();
  }

  public async getValue<T = any>(key: string): Promise<T | null> {
    const value = await this._client.get(key);
    return value ? (parse(value) as T) : null;
  }

  public async putValue(
    key: string,
    value: any,
    expireMs?: number
  ): Promise<boolean> {
    const jsonValue = stringify(value);
    const result = expireMs
      ? await this._client.set(key, jsonValue, 'PX', expireMs)
      : await this._client.set(key, jsonValue);
    return result === 'OK';
  }

  public async hasKey(key: string): Promise<boolean> {
    const result = await this._client.exists(key);
    return result === 1;
  }

  public async removeValue(key: string): Promise<boolean> {
    const result = await this._client.del(key);
    return result > 0;
  }

  public async removeEntries(query: string): Promise<number> {
    const keys = await this.findKeys(query);
    return this._client.del(...keys);
  }

  public async findKeys(pattern: string = '*'): Promise<Set<string>> {
    return new Promise((resolve) => {
      const stream = this._client.scanStream({
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
      this._client,
      resource,
      lockConfig.expireMs,
      lockConfig.retryCount,
      lockConfig.retryDelay
    );
    return await redisLock.lock();
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    try {
      const result = await this._client.ping();
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

class RedisLock {
  /** @internal */
  private readonly _releaseLockCommand: string = 'releaseLock';

  constructor(
    private readonly client: RedisClient,
    private readonly resource: string,
    private readonly expireMs: number = 5000,
    private readonly retryCount: number = 10,
    private readonly retryDelay: number = 200
  ) {
    this.initReleaseLockScript();
  }

  public async lock(): Promise<{ release: () => Promise<boolean> }> {
    const resourceKey = `lock:${this.resource}`;
    const lockValue = uuid();
    let retries = 0;

    do {
      const result = await this.client.set(
        resourceKey,
        lockValue,
        'PX',
        this.expireMs,
        'NX'
      );
      if (result === 'OK') {
        return {
          release: async () =>
            (await this.client[this._releaseLockCommand](
              resourceKey,
              lockValue
            )) > 0
        };
      } else {
        await setTimeout(this.retryDelay);
        retries++;
      }
    } while (retries < this.retryCount);

    throw new Error('Unable to acquire lock on requested resource');
  }

  private initReleaseLockScript(): void {
    if (this._releaseLockCommand in this.client) {
      return;
    }
    this.client.defineCommand(this._releaseLockCommand, {
      numberOfKeys: 1,
      lua: 'if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end'
    });
  }
}
