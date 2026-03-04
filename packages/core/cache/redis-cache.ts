import { Redis } from '@appweaver/common';
import { inject } from '../context';
import { Cache } from './cache';

export class RedisCache extends Cache {
  constructor() {
    super(inject(Redis));
  }
}
