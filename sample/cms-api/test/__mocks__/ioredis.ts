import RedisMock, { RedisOptions } from 'ioredis-mock';

class IORedisMock extends RedisMock {
  constructor(options: RedisOptions) {
    super({ ...options, lazyConnect: false });
  }
}

export const Redis = IORedisMock;

export default IORedisMock;
