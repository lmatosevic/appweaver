import {
  IHealthCheck,
  HealthCheckResult,
  HealthCheckConfig
} from '../interfaces';
import { HEALTH_CHECK } from '../constants';

export abstract class Database implements IHealthCheck {
  static [HEALTH_CHECK] = true;

  abstract connect(): Promise<void>;

  abstract disconnect(): Promise<void>;

  abstract client<T>(): T;

  abstract checkHealth(): Promise<HealthCheckResult>;

  public checkHealthConfig(): HealthCheckConfig {
    return { name: 'database' };
  }
}
