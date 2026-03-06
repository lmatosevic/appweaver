export enum CacheEvictionStrategy {
  LRU = 'LRU',
  LFU = 'LFU',
  FIFO = 'FIFO'
}

export enum CacheInvalidationStrategy {
  ExpireRelated = 'expire-related',
  ExpireAll = 'expire-all',
  None = 'none'
}
