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
   * @returns {Promise<ContentStream | null>} A promise that resolves to `ContentStream` with the stream and size, or
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
   * @returns {Promise<string | null>} A promise that resolves to the stored file name/path, or `null` on failure.
   */
  abstract store(fileName: string, data: Readable): Promise<string | null>;

  /**
   * Deletes a file from storage.
   *
   * @param {string} fileName - The file name/path to delete.
   * @returns {Promise<boolean>} A promise that resolves to `true` if file/path is deleted successfully, `false`
   * otherwise.
   */
  abstract delete(fileName: string): Promise<boolean>;

  /**
   * Checks whether a file exists.
   *
   * @param {string} fileName - The file name/path to check existance.
   * @return {Promise<boolean>} A promise that resolves to `true` if file/path exists, `false` otherwise.
   */
  abstract exists(fileName: string): Promise<boolean>;

  abstract checkHealth(): Promise<HealthCheckResult>;

  public checkHealthConfig(): HealthCheckConfig {
    return { name: 'storage' };
  }
}
