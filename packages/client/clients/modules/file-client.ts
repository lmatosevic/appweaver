import { Client } from 'openapi-fetch';
import { BaseClient, RequestOptions } from './base-client';
import { FileDataResponse } from '../responses';
import { FILE_OPERATIONS } from '../../constants';

export type FileInterface = {
  [K in keyof typeof FILE_OPERATIONS]: (...args: any[]) => Promise<any>;
};

export class FileClient extends BaseClient implements FileInterface {
  constructor(
    client: Client<{ [key: string]: any }>,
    private readonly _filesPath: string
  ) {
    super(client);
  }

  /**
   * Downloads a publicly accessible file by its path/name.
   *
   * @param {string} fileName - The path or name of the file to retrieve from the public storage.
   * @param {RequestOptions} options - Additional request options.
   * @returns {@link FileDataResponse} containing the readable stream and file metadata.
   */
  public async public(
    fileName: string,
    options: RequestOptions = {}
  ): Promise<FileDataResponse> {
    const { error, response } = await this.sendRequestRaw(
      'get',
      `${this._filesPath}/public/{*}`,
      {
        ...options,
        parseAs: 'stream',
        params: {
          ...(options.params ?? {}),
          path: {
            '*': fileName
          }
        }
      }
    );

    if (error) {
      this.handleError(error, response);
    }

    return this.toFileResponse(response, fileName);
  }

  /**
   * Downloads a protected file by its path/name. Requires the request to be authenticated.
   *
   * @param {string} fileName - The path or name of the file to retrieve from the protected storage.
   * @param {RequestOptions} options - Additional request options.
   * @returns {@link FileDataResponse} containing the readable stream and file metadata.
   */
  public async protected(
    fileName: string,
    options: RequestOptions = {}
  ): Promise<FileDataResponse> {
    const { error, response } = await this.sendRequestRaw(
      'get',
      `${this._filesPath}/protected/{*}`,
      {
        ...options,
        parseAs: 'stream',
        params: {
          ...(options.params ?? {}),
          path: {
            '*': fileName
          }
        }
      }
    );

    if (error) {
      this.handleError(error, response);
    }

    return this.toFileResponse(response, fileName);
  }
}
