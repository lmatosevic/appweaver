import {
  IHealthCheck,
  HealthCheckResult,
  HealthCheckConfig,
  OnInit,
  OnDestroy
} from '../interfaces';
import { HEALTH_CHECK, LIFECYCLE } from '../constants';

export abstract class Database implements IHealthCheck, OnInit, OnDestroy {
  static [LIFECYCLE]: true;
  static [HEALTH_CHECK] = true;

  abstract onInit(): Promise<void>;

  abstract onDestroy(): Promise<void>;

  abstract connect(): Promise<void>;

  abstract disconnect(): Promise<void>;

  abstract client<T>(): T;

  abstract checkHealth(): Promise<HealthCheckResult>;

  public checkHealthConfig(): HealthCheckConfig {
    return { name: 'database' };
  }
}
