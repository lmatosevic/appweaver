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
