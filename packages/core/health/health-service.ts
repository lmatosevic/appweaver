import {
  HealthCheckConfig,
  HealthCheckResult,
  HealthCheckStatus,
  IHealthCheck,
  isHealthCheck,
  createLogger,
  uncapitalize
} from '@appweaver/common';
import { healthConfig } from './health-config';
import { injectAllWhere } from '../context';

const logger = createLogger('health');

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
  /** @internal */
  private readonly _statuses = new Map<string, HealthCheckStatus>();
  /** @internal */
  private _ready = false;

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
          message: !hideMessages.includes(key)
            ? checkResults[index].message
            : undefined
        };
        return acc;
      },
      {}
    );

    Object.keys(healthChecks).forEach((name, index) =>
      this.logTransition(name, checkResults[index])
    );

    logger.debug({ healthCheckResponse }, 'Health checks completed');

    return healthCheckResponse;
  }

  /**
   * Checks whether the application can handle requests: once the `onReady` hook of every service completed, until
   * its shutdown starts.
   *
   * @return {Promise<boolean>} A promise that resolves to `true` if ready, otherwise `false`.
   */
  public async checkReadiness(): Promise<boolean> {
    return this._ready;
  }

  /**
   * Sets whether the application can handle requests, which the application does when it is ready and when its
   * shutdown starts.
   *
   * @param {boolean} ready - Whether the application is ready.
   */
  public setReady(ready: boolean): void {
    this._ready = ready;
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

    const pick = healthConfig.PICK_INSTANCES;
    if (pick) {
      all = all.filter((instance) => pick.includes(instance.name));
    }

    const omit = healthConfig.OMIT_INSTANCES;
    if (omit) {
      all = all.filter((instance) => !omit.includes(instance.name));
    }

    return all;
  }

  /**
   * Logs a check going down, as a warning, and coming up again, once per change rather than on every probe.
   *
   * @internal
   */
  private logTransition(name: string, result: HealthCheckResult): void {
    const status = result.success
      ? HealthCheckStatus.Up
      : HealthCheckStatus.Down;
    const previous = this._statuses.get(name);
    this._statuses.set(name, status);

    if (status === HealthCheckStatus.Down && previous !== status) {
      logger.warn(
        { check: name, message: result.message },
        'Health check is down'
      );
    } else if (
      status === HealthCheckStatus.Up &&
      previous === HealthCheckStatus.Down
    ) {
      logger.info({ check: name }, 'Health check is up again');
    }
  }
}
