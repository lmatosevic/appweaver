import { OnInit } from '../interfaces';
import { LIFECYCLE } from '../constants';

export type CacheEntryMeta = {
  key: string;
  usedCount: number;
  createdAt: number;
  lastUsedAt: number;
  expiresAt?: number;
};

export abstract class Cache implements OnInit {
  static [LIFECYCLE] = true;

  abstract onInit(): Promise<void>;

  abstract get<T>(key: string): Promise<T | null>;

  abstract has(key: string): Promise<boolean>;

  abstract set(key: string, value: any, ttl?: number): Promise<boolean>;

  abstract evict(key: string): Promise<boolean>;

  abstract expire(pattern?: string): Promise<number>;

  abstract keys(pattern?: string): Promise<string[]>;
}
