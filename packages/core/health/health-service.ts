import { HealthCheckStatus, isFunction, uncapitalize } from '@appweaver/common';
import { HealthCheck, HealthCheckResult } from './health-check-interface';
import { injectAllWhere } from '../context';

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
    const services = injectAllWhere<HealthCheck>((def) =>
      isFunction((def.value as HealthCheck).checkHealth)
    );
    return services.map((service) => ({
      name: uncapitalize(service.constructor.name),
      instance: service
    }));
  }
}

const healthService = new HealthService();

export { healthService };
