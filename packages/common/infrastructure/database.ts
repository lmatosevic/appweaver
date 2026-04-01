import {
  IHealthCheck,
  HealthCheckResult,
  HealthCheckConfig,
  OnInit,
  OnDestroy
} from '../interfaces';
import { HEALTH_CHECK, LIFECYCLE } from '../constants';

export abstract class Database implements IHealthCheck, OnInit, OnDestroy {
  static [LIFECYCLE] = true;
  static [HEALTH_CHECK] = true;

  abstract onInit(): Promise<void>;

  abstract onDestroy(): Promise<void>;

  /** Establishes the database connection. */
  abstract connect(): Promise<void>;

  /** Closes the database connection. */
  abstract disconnect(): Promise<void>;

  /**
   * Returns the underlying database client.
   *
   * @returns The typed client instance.
   */
  abstract client<T>(): T;

  abstract checkHealth(): Promise<HealthCheckResult>;

  public checkHealthConfig(): HealthCheckConfig {
    return { name: 'database' };
  }
}
