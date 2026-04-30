import { Client } from 'openapi-fetch';
import { BaseClient, RequestOptions } from './base-client';
import { FileDataResponse } from '../responses';
import { RESOURCE_OPERATIONS, RESOURCE_TYPES } from '../../constants';

export type ResourceType = Record<(typeof RESOURCE_TYPES)[number], unknown>;

export type ResourceInterface = {
  [K in keyof typeof RESOURCE_OPERATIONS]: (...args: any[]) => Promise<any>;
};

export class ResourceClient<Resource extends ResourceType>
  extends BaseClient
  implements ResourceInterface
{
  constructor(
    client: Client<{ [key: string]: any }>,
    private readonly _resourcePath: string
  ) {
    super(client);
  }

  /**
   * Fetches a single resource by its numeric ID.
   *
   * @param {number} id - The ID of the resource to retrieve.
   * @param {RequestOptions} options - Additional request options (headers, query params, etc.).
   * @returns The resource record matching the given ID.
   */
  public async find(
    id: number,
    options: RequestOptions = {}
  ): Promise<Resource['single']> {
    return this.sendRequest('get', `${this._resourcePath}/{id}`, {
      ...options,
      params: {
        ...(options.params ?? {}),
        path: {
          id
        }
      }
    });
  }

  /**
   * Executes a query against the resource collection.
   *
   * @param {Object} request - The query payload (filters, sorting, pagination, etc.).
   * @param {RequestOptions}  options - Additional request options.
   * @returns A paginated or filtered list of matching resource records.
   */
  public async query(
    request: Resource['queryRequest'],
    options: RequestOptions = {}
  ): Promise<Resource['queryResponse']> {
    return this.sendRequest('post', `${this._resourcePath}/query`, {
      ...options,
      body: request
    });
  }

  /**
   * Runs an aggregation query (e.g., count, sum, avg) against the resource collection.
   *
   * @param {Object} request - The aggregation payload describing the desired computation.
   * @param {RequestOptions} options - Additional request options.
   * @returns The aggregated result for the given query.
   */
  public async aggregate(
    request: Resource['aggregateRequest'],
    options: RequestOptions = {}
  ): Promise<Resource['aggregateResponse']> {
    return this.sendRequest('post', `${this._resourcePath}/aggregate`, {
      ...options,
      body: request
    });
  }

  /**
   * Creates a new resource record.
   *
   * @param {Object} resource - The data for the resource to create.
   * @param {RequestOptions} options - Additional request options.
   * @returns The newly created resource record.
   */
  public async create(
    resource: Resource['create'],
    options: RequestOptions = {}
  ): Promise<Resource['single']> {
    return this.sendRequest('post', `${this._resourcePath}`, {
      ...options,
      body: resource
    });
  }

  /**
   * Updates an existing resource record identified by `id`.
   *
   * @param {Object} resource - The updated field values including the mandatory `id`.
   * @param {RequestOptions} options - Additional request options.
   * @returns The updated resource record.
   */
  public async update(
    resource: Resource['update'] & { id: number },
    options: RequestOptions = {}
  ): Promise<Resource['single']> {
    return this.sendRequest('put', `${this._resourcePath}/{id}`, {
      ...options,
      params: {
        ...(options.params ?? {}),
        path: {
          id: resource['id']
        }
      },
      body: resource
    });
  }

  /**
   * Deletes a resource record by its numeric ID.
   *
   * @param {number} id - The ID of the resource to delete.
   * @param {RequestOptions} options - Additional request options.
   * @returns The deleted resource record.
   */
  public async delete(
    id: number,
    options: RequestOptions = {}
  ): Promise<Resource['single']> {
    return this.sendRequest('delete', `${this._resourcePath}/{id}`, {
      ...options,
      params: {
        ...(options.params ?? {}),
        path: {
          id
        }
      }
    });
  }

  /**
   * Exports resource records as a file (e.g., CSV) and returns a streaming response.
   *
   * @param {Object} request - The export request payload (filters, format, etc.).
   * @param {RequestOptions} options - Additional request options.
   * @returns {@link FileDataResponse} containing the readable stream and file metadata.
   */
  public async export(
    request: Resource['exportRequest'],
    options: RequestOptions = {}
  ): Promise<FileDataResponse> {
    const { error, response } = await this.sendRequestRaw(
      'post',
      `${this._resourcePath}/export`,
      {
        ...options,
        parseAs: 'stream',
        body: request
      }
    );

    if (error) {
      this.handleError(error, response);
    }

    return this.toFileResponse(response);
  }

  /**
   * Uploads one or more files to the resource record.
   *
   * Each entry in `files` maps a field name to a single `File` or an array of `File` objects.
   *
   * @param {Object} files - A map of field names to the file(s) to upload.
   * @param {RequestOptions} options - Additional request options.
   * @returns The updated file metadata for the resource.
   */
  public async uploadFiles(
    files: Resource['fileUpload'],
    options: RequestOptions = {}
  ): Promise<Resource['files']> {
    const formData = new FormData();

    for (const [fieldName, fileData] of Object.entries(
      files as Record<string, File | File[]>
    )) {
      if (Array.isArray(fileData)) {
        for (const file of fileData) {
          formData.append(fieldName, file);
        }
      } else {
        formData.append(fieldName, fileData);
      }
    }

    return this.sendRequest('post', `${this._resourcePath}/{id}/files`, {
      ...options,
      body: files
    });
  }

  /**
   * Removes specific files from the resource record.
   *
   * @param {Object} files - The file deletion payload identifying which files to remove.
   * @param {RequestOptions} options - Additional request options.
   * @returns The updated file metadata for the resource after deletion.
   */
  public async deleteFiles(
    files: Resource['fileDelete'],
    options: RequestOptions = {}
  ): Promise<Resource['files']> {
    return this.sendRequest('post', `${this._resourcePath}/{id}/delete-files`, {
      ...options,
      body: files
    });
  }
}
