import { BaseModule, RequestOptions } from './base-module';
import { BaseClientInterface } from '../base-client-interface';
import { HEALTH_OPERATIONS, HEALTH_TYPES } from '../../constants';

export type HealthType = Record<(typeof HEALTH_TYPES)[number], unknown>;

export type HealthInterface = {
  [K in keyof typeof HEALTH_OPERATIONS]: (...args: any[]) => Promise<any>;
};

export class HealthClient<Health extends HealthType>
  extends BaseModule
  implements HealthInterface
{
  constructor(
    client: BaseClientInterface,
    public readonly basePath: string
  ) {
    super(client);
  }

  /**
   * Performs a basic health check against the server.
   *
   * @param {RequestOptions} options - Additional request options.
   * @returns The health check response indicating overall server and it's services status.
   */
  public async check(
    options: RequestOptions = {}
  ): Promise<Health['checkResponse']> {
    const { data, error, response } = await this.sendRequestRaw(
      'get',
      `${this.basePath}/check`,
      options
    );

    if (error && response.status !== 503) {
      this.handleError(error, response);
    }

    return data ?? error;
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
    return this.sendRequest('get', `${this.basePath}/ready`, options);
  }
}
