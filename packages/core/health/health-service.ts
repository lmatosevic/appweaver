import { HealthCheckStatus, isFunction, uncapitalize } from '@appweaver/common';
import { injectAllWhere } from '../context';
import { HealthCheck, HealthCheckResult } from '../types';
import { HEALTH_CHECK } from '../constants';

export class HealthService {
  public async checkHealth(): Promise<Record<string, HealthCheckStatus>> {
    const services = this.healthCheckServices();

    const healthChecks: Record<string, Promise<HealthCheckResult>> = {};
    for (const service of services) {
      healthChecks[service.name] = service.instance.checkHealth();
    }

    const checkResults = await Promise.all(Object.values(healthChecks));

    return Object.keys(healthChecks).reduce((acc, key, index) => {
      acc[key] = {
        status: checkResults[index].success
          ? HealthCheckStatus.Up
          : HealthCheckStatus.Down,
        message: checkResults[index].message
      };
      return acc;
    }, {});
  }

  public async checkReadiness(): Promise<boolean> {
    return true;
  }

  public healthCheckServices(): { name: string; instance: HealthCheck }[] {
    const services = injectAllWhere<HealthCheck>(
      (def) =>
        def.value.constructor?.[HEALTH_CHECK] &&
        isFunction((def.value as HealthCheck).checkHealth)
    );

    // Return a unique set of services that correctly implement the health check
    return Array.from(
      new Map(
        services.map((service) => [
          uncapitalize(service.constructor.name),
          {
            name: uncapitalize(service.constructor.name),
            instance: service
          }
        ])
      ).values()
    );
  }
}
