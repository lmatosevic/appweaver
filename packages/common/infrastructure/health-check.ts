import { HealthCheckStatus } from '../enums';

export type HealthCheckConfig = {
  name?: string;
  showMessage?: boolean;
};

export type HealthCheckResult = {
  success: boolean;
  message?: string;
};

export interface IHealthCheck {
  checkHealth(): Promise<HealthCheckResult>;
  checkHealthConfig?(): HealthCheckConfig;
}

export abstract class HealthCheck {
  abstract checkHealth(): Promise<Record<string, HealthCheckStatus>>;

  abstract checkReadiness(): Promise<boolean>;

  abstract healthCheckServices(): { name: string; instance: IHealthCheck }[];
}
