import { HealthCheckStatus } from '../enums';
import { IHealthCheck } from '../interfaces';

export abstract class HealthCheck {
  abstract checkHealth(): Promise<Record<string, HealthCheckStatus>>;

  abstract checkReadiness(): Promise<boolean>;

  abstract healthCheckServices(): { name: string; instance: IHealthCheck }[];
}
