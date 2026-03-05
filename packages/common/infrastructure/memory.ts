import {
  HealthCheckConfig,
  HealthCheckResult,
  IHealthCheck
} from '../interfaces';
import { HEALTH_CHECK } from '../constants';

export abstract class Memory implements IHealthCheck {
  static [HEALTH_CHECK] = true;

  abstract connect(): Promise<void>;

  abstract disconnect(): Promise<void>;

  abstract getValue<T = any>(key: string): Promise<T | null>;

  abstract putValue(
    key: string,
    value: any,
    expireMs?: number
  ): Promise<boolean>;

  abstract hasKey(key: string): Promise<boolean>;

  abstract removeValue(key: string): Promise<boolean>;

  abstract removeEntries(query: string): Promise<number>;

  abstract findKeys(pattern?: string): Promise<Set<string>>;

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
