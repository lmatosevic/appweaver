import { Client } from 'openapi-fetch';
import { BaseClient, RequestOptions } from './base-client';
import { HEALTH_OPERATIONS, HEALTH_TYPES } from '../../constants';

export type HealthType = Record<(typeof HEALTH_TYPES)[number], unknown>;

export type HealthInterface = {
  [K in keyof typeof HEALTH_OPERATIONS]: (...args: any[]) => Promise<any>;
};

export class HealthClient<Health extends HealthType>
  extends BaseClient
  implements HealthInterface
{
  constructor(
    client: Client<{ [key: string]: any }>,
    private readonly _healthPath: string
  ) {
    super(client);
  }

  /**
   * Performs a basic health check against the server.
   *
   * @param {RequestOptions} options - Additional request options.
   * @returns The health check response indicating overall server status.
   */
  public async check(
    options: RequestOptions = {}
  ): Promise<Health['checkResponse']> {
    return this.sendRequest('get', `${this._healthPath}/check`, options);
  }

  /**
   * Checks whether the server is ready to accept traffic (e.g., database connected, migrations applied).
   *
   * @param {RequestOptions} options - Additional request options.
   * @returns The readiness response indicating whether the server is fully operational.
   */
  public async ready(
    options: RequestOptions = {}
  ): Promise<Health['readyResponse']> {
    return this.sendRequest('get', `${this._healthPath}/ready`, options);
  }
}
