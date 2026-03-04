import { Memory } from './memory';
import { HealthCheckConfig } from './health-check';

export abstract class Redis<Options = any, Client = any> extends Memory {
  abstract createClient(options?: Options): Client;

  public checkHealthConfig(): HealthCheckConfig {
    return { name: 'redis' };
  }
}
