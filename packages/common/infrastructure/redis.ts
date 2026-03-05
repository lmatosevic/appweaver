import { HealthCheckConfig } from '../interfaces';
import { Memory } from './memory';

export abstract class Redis<Options = any, Client = any> extends Memory {
  abstract createClient(options?: Options): Client;

  public checkHealthConfig(): HealthCheckConfig {
    return { name: 'redis' };
  }
}
