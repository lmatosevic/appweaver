import { Client, FetchOptions } from 'openapi-fetch';
import { HttpMethod, RequiredKeysOf } from 'openapi-typescript-helpers';
import { ClientError } from '../../errors';

export type InitParam<Init> =
  RequiredKeysOf<Init> extends never
    ? [(Init & { [key: string]: unknown })?]
    : [Init & { [key: string]: unknown }];

export type RequestOptions<T = any> = FetchOptions<T>;

export type FileDataResponse = {
  stream: ReadableStream;
  fileName: string;
  type: string;
  length: number;
  range?: FileContentRange;
  maxAge?: number;
  expiresAt?: string;
};

export type FileContentRange = {
  start: number;
  end: number;
  total: number;
};

export abstract class BaseClient {
  protected constructor(
    private readonly _client: Client<{ [key: string]: any }>
  ) {}

  protected async sendRequest<Resp = any>(
    method: HttpMethod,
    path: string,
    ...params: InitParam<any>
  ): Promise<Resp> {
    const { data, error, response } = await this._client.request(
      method,
      path,
      ...params
    );

    if (error) {
      this.handleError(error, response);
    }

    return data;
  }

  protected async sendRequestRaw<Resp = any>(
    method: HttpMethod,
    path: string,
    ...params: InitParam<any>
  ): Promise<{ data: Resp; error: any; response: Response }> {
    return this._client.request(method, path, ...params) as any;
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

    return {
      fileName,
      stream: response.body!,
      type: response.headers.get('Content-Type') ?? '',
      length: parseInt(length, 10),
      range,
      maxAge: maxAge ? parseInt(maxAge, 10) : undefined,
      expiresAt: response.headers.get('Expires') ?? undefined
    };
  }

  protected handleError(error: any, response: Response): void {
    throw new ClientError(
      error.message ?? 'Unknown error',
      error.errorCode ?? response.status,
      response
    );
  }
}
