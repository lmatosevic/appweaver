import { IHealthCheck, HealthCheckResult } from './health-check';
import { HEALTH_CHECK } from '../constants';

export abstract class Database implements IHealthCheck {
  constructor() {
    this[HEALTH_CHECK] = true;
  }

  abstract connect(): Promise<void>;

  abstract disconnect(): Promise<void>;

  abstract client<T>(): T;

  abstract checkHealth(): Promise<HealthCheckResult>;
}
