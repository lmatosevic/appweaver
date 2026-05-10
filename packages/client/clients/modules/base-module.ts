import { FetchOptions } from 'openapi-fetch';
import { HttpMethod } from 'openapi-typescript-helpers';
import { BaseClientInterface, InitParam } from '../base-client-interface';
import { FileContentRange, FileDataResponse } from '../responses';
import { ClientError } from '../../errors';

export type RequestOptions<T = any> = FetchOptions<T>;

export abstract class BaseModule {
  protected constructor(private readonly _client: BaseClientInterface) {}

  protected async sendRequest<Resp = any>(
    method: HttpMethod,
    path: string,
    ...params: InitParam<any>
  ): Promise<Resp> {
    return this._client.sendRequestPromise(method, path, ...params);
  }

  protected async sendRequestRaw<Resp = any>(
    method: HttpMethod,
    path: string,
    ...params: InitParam<any>
  ): Promise<{ data: Resp; error: any; response: Response }> {
    return (await this._client.sendRequestRawPromise(
      method,
      path,
      ...params
    )) as any;
  }

  protected toFileResponse(
    response: Response,
    defaultName: string = 'unknown'
  ): FileDataResponse {
    const fileName =
      response.headers
        .get('Content-Disposition')
        ?.split('filename=')[1]
        ?.replace(/"/g, '') ?? defaultName;

    const length = response.headers.get('Content-Length') ?? '0';

    const maxAge = response.headers
      .get('Cache-Control')
      ?.split('max-age=')[1]
      ?.replace(/"/g, '');

    const matchRangeParts = response.headers
      .get('Content-Range')
      ?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);

    let range: FileContentRange | undefined = undefined;

    if (matchRangeParts) {
      const [, start, end, total] = matchRangeParts;
      range = {
        start: parseInt(start, 10),
        end: parseInt(end, 10),
        total: parseInt(total, 10)
      };
    }

    return new FileDataResponse({
      fileName,
      stream: response.body!,
      type: response.headers.get('Content-Type') ?? '',
      length: parseInt(length, 10),
      range,
      maxAge: maxAge ? parseInt(maxAge, 10) : undefined,
      expiresAt: response.headers.get('Expires') ?? undefined
    });
  }

  protected handleError(error: any, response: Response): void {
    throw new ClientError(
      error.message ?? response.statusText ?? 'Unknown error',
      error.errorCode ?? response.status,
      response,
      error
    );
  }
}
