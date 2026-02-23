export type HealthCheckResult = {
  success: boolean;
  message?: string;
}

export interface HealthCheck {
  checkHealth(): Promise<HealthCheckResult>;
}
