import {
  config,
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

export type HealthCheckInstance = {
  name: string;
  value: IHealthCheck;
  config?: HealthCheckConfig;
};

export class HealthService {
  /**
   * Performs a health check for multiple health check instances by invoking their respective health check methods.
   *
   * @return {Promise<Record<string, HealthCheckResponse>>} A promise that resolves to an object where each key is the
   * name of the instance, and the value is a health check response containing the instance status and, if applicable,
   * its corresponding message.
   */
  public async checkHealth(): Promise<Record<string, HealthCheckResponse>> {
    const healthCheckInstances = this.healthCheckInstances();

    const hideMessages: string[] = [];
    const healthChecks: Record<string, Promise<HealthCheckResult>> = {};
    for (const instance of healthCheckInstances) {
      healthChecks[instance.name] = instance.value.checkHealth();
      if (instance.config?.showMessage === false) {
        hideMessages.push(instance.name);
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
   * Retrieves a list of instances that implement the health check functionality, ensuring they are unique
   * and properly configured. Each instance is returned with its name, instance, and optional configuration.
   * Some instances can be removed from the list based on the configured pick and omit properties.
   *
   * @return {HealthCheckInstance[]} An array of objects, where each object contains:
   *         - `name`: The unique name assigned to the instance.
   *         - `value`: The instance value implementing the health check interface.
   *         - `config` (optional): Additional configuration details for the health check, if available.
   */
  public healthCheckInstances(): HealthCheckInstance[] {
    const instances = injectAllWhere<IHealthCheck>((def) =>
      isHealthCheck(def.value)
    );

    // Return a unique set of instances that correctly implement the health check
    let all = Array.from(
      new Map(
        instances.map((value) => {
          const instanceConfig = value.checkHealthConfig?.();
          const name =
            instanceConfig?.name || uncapitalize(value.constructor.name);
          return [
            name,
            {
              name,
              value,
              config: instanceConfig
            }
          ];
        })
      ).values()
    );

    const pick = config.HEALTH_CHECK_PICK_INSTANCES;
    if (pick) {
      all = all.filter((instance) => pick.includes(instance.name));
    }

    const omit = config.HEALTH_CHECK_OMIT_INSTANCES;
    if (omit) {
      all = all.filter((instance) => !omit.includes(instance.name));
    }

    return all;
  }
}
