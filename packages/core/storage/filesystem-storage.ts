import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import {
  config,
  ContentStream,
  HealthCheckResult,
  logger,
  normalizeStoragePath,
  resolveStoragePath,
  Storage
} from '@appweaver/common';

export class FilesystemStorage extends Storage {
  /** @internal */
  private readonly _dirPath: string = path.resolve(config.STORAGE_PATH);

  public async onInit(): Promise<void> {
    const directoryExists = await this.pathExists(this._dirPath);
    if (!directoryExists) {
      await fsp.mkdir(this._dirPath, { recursive: true });
      logger.info(`Storage directory initialized: ${this._dirPath}`);
    }
  }

  public async stream(
    fileName: string,
    start: number = 0,
    end?: number
  ): Promise<ContentStream | null> {
    const filePath = this.resolveFilePath(fileName, 'stream');
    if (!filePath) {
      return null;
    }

    try {
      const { size } = await fsp.stat(filePath);

      const endIndex =
        start >= 0 && !end && end !== 0
          ? size - 1
          : Math.min(end ?? Number.MAX_SAFE_INTEGER, size - 1);

      const fileReadStream = fs.createReadStream(filePath, {
        start,
        end: !Number.isNaN(endIndex) ? endIndex : undefined
      });

      return { stream: fileReadStream, size };
    } catch (e) {
      logger.error(e, `Error streaming file: ${filePath}`);
      return null;
    }
  }

  public async store(fileName: string, data: Readable): Promise<string | null> {
    const filePath = this.resolveFilePath(fileName, 'store');
    if (!filePath) {
      // The stream must still be consumed to prevent request from hanging.
      data.resume();
      return null;
    }

    try {
      await this.ensureDirectoryExists(filePath);
      await pipeline(data, fs.createWriteStream(filePath));
      return normalizeStoragePath(fileName) ?? fileName;
    } catch (e) {
      logger.error(e, `Error storing file: ${filePath}`);
      return null;
    }
  }

  public async delete(fileName: string): Promise<boolean> {
    const filePath = this.resolveFilePath(fileName, 'delete');
    if (!filePath) {
      return false;
    }

    try {
      await fsp.unlink(filePath);
      await this.removeEmptyDirectories(path.dirname(filePath));
      return true;
    } catch (e) {
      logger.error(e, `Error deleting file: ${filePath}`);
      return false;
    }
  }

  public async exists(fileName: string): Promise<boolean> {
    const filePath = this.resolveFilePath(fileName, 'exists');
    if (!filePath) {
      return false;
    }
    return this.pathExists(filePath);
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    try {
      await fsp.access(this._dirPath, fs.constants.R_OK | fs.constants.W_OK);
      return { success: true };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }

  /** @internal */
  private resolveFilePath(fileName: string, action: string): string | null {
    const filePath = resolveStoragePath(this._dirPath, fileName);

    if (!filePath) {
      logger.warn({ fileName, action }, 'Rejected invalid storage file path');
      return null;
    }

    return filePath;
  }

  /** @internal */
  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fsp.access(filePath, fs.constants.F_OK);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** @internal */
  private async removeEmptyDirectories(filePath: string): Promise<void> {
    const normalizedDirPath = path.normalize(filePath);
    if (
      !normalizedDirPath ||
      normalizedDirPath === path.normalize(this._dirPath)
    ) {
      return;
    }

    try {
      const fileStats = await fsp.lstat(filePath);
      if (!fileStats.isDirectory()) {
        return;
      }
    } catch {
      return;
    }

    let files = await fsp.readdir(filePath);

    if (files.length > 0) {
      const recursiveRemovalActions = files.map((file) =>
        this.removeEmptyDirectories(path.join(filePath, file))
      );
      await Promise.all(recursiveRemovalActions);
      files = await fsp.readdir(filePath);
    }

    if (files.length === 0) {
      await fsp.rmdir(filePath);
      await this.removeEmptyDirectories(path.dirname(filePath));
    }
  }

  /** @internal */
  private async ensureDirectoryExists(filePath: string): Promise<void> {
    const dirname = path.dirname(filePath);
    if (!(await this.pathExists(dirname))) {
      await fsp.mkdir(dirname, { recursive: true });
    }
  }
}
