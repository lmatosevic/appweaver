import {
  HealthCheckConfig,
  HealthCheckResult,
  HealthCheckStatus,
  IHealthCheck,
  isHealthCheck,
  uncapitalize
} from '@appweaver/common';
import { injectAllWhere } from '../context';

export type HealthCheckResponse = {
  status: HealthCheckStatus;
  message?: string;
};

export class HealthService {
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

    return Object.keys(healthChecks).reduce((acc, key, index) => {
      acc[key] = {
        status: checkResults[index].success
          ? HealthCheckStatus.Up
          : HealthCheckStatus.Down,
        message: !hideMessages[key] ? checkResults[index].message : undefined
      };
      return acc;
    }, {});
  }

  public async checkReadiness(): Promise<boolean> {
    return true;
  }

  public healthCheckServices(): {
    name: string;
    instance: IHealthCheck;
    config?: HealthCheckConfig;
  }[] {
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
