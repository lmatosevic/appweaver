export type HealthCheckConfig = {
  name?: string;
  showMessage?: boolean;
};

export type HealthCheckResult = {
  success: boolean;
  message?: string;
};

export interface IHealthCheck {
  /**
   * Performs a health check and evaluates the status of the system or service.
   *
   * @return {Promise<HealthCheckResult>} A promise that resolves to a HealthCheckResult object,
   * indicating the health status and associated details.
   */
  checkHealth(): Promise<HealthCheckResult>;

  /**
   * Evaluates and retrieves the current health check configuration. This method
   * implementation is optional.
   *
   * @return {HealthCheckConfig} The configuration parameters defining the health check settings.
   */
  checkHealthConfig?(): HealthCheckConfig;
}
