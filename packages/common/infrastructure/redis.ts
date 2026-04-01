import { HealthCheckConfig } from '../interfaces';
import { Memory } from './memory';

export abstract class Redis<Options = any, Client = any> extends Memory {
  /**
   * Creates and returns a Redis client instance.
   *
   * @param {Object} options - Provider-specific Redis client options.
   */
  abstract createClient(options?: Options): Client;

  public checkHealthConfig(): HealthCheckConfig {
    return { name: 'redis' };
  }
}
