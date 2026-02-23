import { Redis as RedisClient } from 'ioredis';
import { setTimeout } from 'node:timers/promises';
import { uuid } from '@appweaver/common';

export class RedisLock {
  private readonly releaseLockCommand: string = 'releaseLock';

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
            (await this.client[this.releaseLockCommand](
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
    if (this.releaseLockCommand in this.client) {
      return;
    }
    this.client.defineCommand(this.releaseLockCommand, {
      numberOfKeys: 1,
      lua: 'if redis.call("get",KEYS[1]) == ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end'
    });
  }
}
