import { Memory } from '@appweaver/common';
import { inject } from '../context/dependency-injection';
import { Cache } from './cache';

export class MemoryCache extends Cache {
  constructor() {
    super(inject(Memory));
  }
}
