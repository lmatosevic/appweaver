import { Readable } from 'node:stream';
import {
  HealthCheckConfig,
  HealthCheckResult,
  IHealthCheck,
  OnInit
} from '../interfaces';
import { HEALTH_CHECK, LIFECYCLE } from '../constants';

export type ContentStream = {
  stream: Readable;
  size: number;
};

/** What is known of a file when it is stored, which a cloud storage keeps as its metadata. */
export type StoreOptions = {
  /** The MIME type of the content, i.e. `image/png`. */
  contentType?: string;
  /** The size of the content in bytes, when known before it is streamed. */
  size?: number;
};

export type FileUrlOptions = {
  /** How long the URL is valid in milliseconds, i.e. of a signed URL. */
  expiresIn?: number;
};

export abstract class Storage implements IHealthCheck, OnInit {
  static [LIFECYCLE] = true;
  static [HEALTH_CHECK] = true;

  abstract onInit(): Promise<void>;

  /**
   * Streams the content of a file over a byte range.
   *
   * @param {string} fileName - The file name/path to stream.
   * @param {number} start - The start byte offset.
   * @param {number} [end] - Optional end byte offset.
   * @return {Promise<ContentStream | null>} A promise that resolves to `ContentStream` with the stream and size, or
   * `null` if a file is not found.
   */
  abstract stream(
    fileName: string,
    start: number,
    end?: number
  ): Promise<ContentStream | null>;

  /**
   * Stores a file from a readable stream.
   *
   * @param {string} fileName - The target file name/path.
   * @param {Readable} data - The readable stream containing file data.
   * @param {StoreOptions} [options] - The content type and the size of the file, when known.
   * @return {Promise<string | null>} A promise that resolves to the stored file name/path, or `null` on failure.
   */
  abstract store(
    fileName: string,
    data: Readable,
    options?: StoreOptions
  ): Promise<string | null>;

  /**
   * Deletes a file from storage.
   *
   * @param {string} fileName - The file name/path to delete.
   * @return {Promise<boolean>} A promise that resolves to `true` if file/path is deleted successfully, `false`
   * otherwise.
   */
  abstract delete(fileName: string): Promise<boolean>;

  /**
   * Checks whether a file exists.
   *
   * @param {string} fileName - The file name/path to check existence.
   * @return {Promise<boolean>} A promise that resolves to `true` if file/path exists, `false` otherwise.
   */
  abstract exists(fileName: string): Promise<boolean>;

  abstract checkHealth(): Promise<HealthCheckResult>;

  /**
   * Returns a URL the clients download a file from directly, i.e. a signed URL of a cloud storage, which the files
   * route redirects to instead of streaming the file through the server. A storage without such URLs returns `null`.
   *
   * @param {string} _fileName - The file name/path.
   * @param {FileUrlOptions} [_options] - The options of the URL.
   * @return {Promise<string | null>} The URL, or `null` to stream the file through the server.
   */
  public async url(
    _fileName: string,
    _options?: FileUrlOptions
  ): Promise<string | null> {
    return null;
  }

  public checkHealthConfig(): HealthCheckConfig {
    return { name: 'storage' };
  }
}
