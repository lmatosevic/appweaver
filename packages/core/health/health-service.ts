import {
  HealthCheckConfig,
  HealthCheckResult,
  HealthCheckStatus,
  IHealthCheck,
  isHealthCheck,
  logger,
  uncapitalize
} from '@appweaver/common';
import { injectAllWhere } from '../context';

export type HealthCheckResponse = {
  status: HealthCheckStatus;
  message?: string;
};

export type HealthCheckService = {
  name: string;
  instance: IHealthCheck;
  config?: HealthCheckConfig;
};

export class HealthService {
  /**
   * Performs a health check for multiple services by invoking their respective health check methods.
   *
   * @return {Promise<Record<string, HealthCheckResponse>>} A promise that resolves to an object where each key is the
   * name of the service,
   * and the value is a health check response containing the service status and, if applicable, its corresponding
   * message.
   */
  public async checkHealth(): Promise<Record<string, HealthCheckResponse>> {
    const services = this.healthCheckServices();

    const hideMessages: string[] = [];
    const healthChecks: Record<string, Promise<HealthCheckResult>> = {};
    for (const service of services) {
      healthChecks[service.name] = service.instance.checkHealth();
      if (service.config?.showMessage === false) {
        hideMessages.push(service.name);
      }
    }

    const checkResults = await Promise.all(Object.values(healthChecks));

    const healthCheckResponse = Object.keys(healthChecks).reduce(
      (acc, key, index) => {
        acc[key] = {
          status: checkResults[index].success
            ? HealthCheckStatus.Up
            : HealthCheckStatus.Down,
          message: !hideMessages[key] ? checkResults[index].message : undefined
        };
        return acc;
      },
      {}
    );

    logger.debug({ healthCheckResponse }, 'Health checks completed');

    return healthCheckResponse;
  }

  /**
   * Asynchronously checks the readiness status of a system or component.
   *
   * @return {Promise<boolean>} A promise that resolves to a boolean value indicating readiness status. Returns `true`
   * if ready, otherwise `false`.
   */
  public async checkReadiness(): Promise<boolean> {
    return true;
  }

  /**
   * Retrieves a list of services that implement the health check functionality, ensuring they are unique
   * and properly configured. Each service is returned with its name, instance, and optional configuration.
   *
   * @return {HealthCheckService[]} An array of objects, where each object contains:
   *         - `name`: The unique name assigned to the service.
   *         - `instance`: The service instance implementing the health check interface.
   *         - `config` (optional): Additional configuration details for the health check, if available.
   */
  public healthCheckServices(): HealthCheckService[] {
    const services = injectAllWhere<IHealthCheck>((def) =>
      isHealthCheck(def.value)
    );

    // Return a unique set of services that correctly implement the health check
    return Array.from(
      new Map(
        services.map((instance) => {
          const config = instance.checkHealthConfig?.();
          const name = config?.name || uncapitalize(instance.constructor.name);
          return [
            name,
            {
              name,
              instance,
              config
            }
          ];
        })
      ).values()
    );
  }
}
