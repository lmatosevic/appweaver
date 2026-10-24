import { Readable } from 'node:stream';
import {
  ContentStream,
  HealthCheckResult,
  Storage,
  StoreOptions
} from '@appweaver/common';
import { {{CONFIG_NAME}} } from './config';

/** The {{MODULE_NAME}} storage, selected with `"storage": { "provider": "{{MODULE_NAME}}" }`. */
export class {{CLASS_NAME}} extends Storage {
  /** Replace with the client of the service, i.e. created from {{CONFIG_NAME}}. */
  private readonly _files = new Map<string, Buffer>();

  public async onInit(): Promise<void> {
    void {{CONFIG_NAME}}.EXAMPLE;
  }

  public async store(
    fileName: string,
    data: Readable,
    _options?: StoreOptions
  ): Promise<string | null> {
    const chunks: Buffer[] = [];
    for await (const chunk of data) {
      chunks.push(Buffer.from(chunk));
    }
    this._files.set(fileName, Buffer.concat(chunks));
    return fileName;
  }

  public async stream(
    fileName: string,
    start: number,
    end?: number
  ): Promise<ContentStream | null> {
    const file = this._files.get(fileName);
    if (!file) {
      return null;
    }
    return {
      stream: Readable.from([file.subarray(start, end === undefined ? undefined : end + 1)]),
      size: file.length
    };
  }

  public async delete(fileName: string): Promise<boolean> {
    return this._files.delete(fileName);
  }

  public async exists(fileName: string): Promise<boolean> {
    return this._files.has(fileName);
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    return { success: true };
  }
}
