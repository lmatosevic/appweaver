import { Memory } from '@appweaver/common';
import { inject } from '../context';
import { Cache } from './cache';

export class MemoryCache extends Cache {
  constructor() {
    super(inject(Memory));
  }
}
