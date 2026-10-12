import { FetchOptions } from 'openapi-fetch';
import { HttpMethod } from 'openapi-typescript-helpers';
import { BaseClientInterface, InitParam } from '../base-client-interface';
import { FileContentRange, FileDataResponse } from '../responses';
import { ClientError } from '../../errors';

export type RequestOptions<T = any> = FetchOptions<T>;

export abstract class BaseModule {
  protected constructor(private readonly _client: BaseClientInterface) {}

  /** Sends a request through the client, resolving to the response data or throwing a `ClientError`. */
  protected async sendRequest<Resp = any>(
    method: HttpMethod,
    path: string,
    ...params: InitParam<any>
  ): Promise<Resp> {
    return this._client.sendRequestPromise(method, path, ...params);
  }

  /** Sends a request through the client, resolving to the data, the error, and the raw response. */
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

  /**
   * Wraps a file download response, reading the file name, length, byte range, and cache headers.
   *
   * @param {Response} response - The response streaming the file content.
   * @param {string} [defaultName='unknown'] - The file name used when the response names none.
   * @return {FileDataResponse} The file content with its metadata.
   */
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

  /** Throws the `ClientError` of a failed response. */
  protected handleError(
    error: any,
    response: Response,
    route?: { method: HttpMethod; path: string }
  ): void {
    throw ClientError.fromResponse(error, response, route);
  }
}
