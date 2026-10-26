import fs from 'node:fs';
import fsp from 'node:fs/promises';
import {
  createLogger,
  LIFECYCLE,
  Memory,
  OnDestroy,
  OnInit
} from '@appweaver/common';
import { inject } from '@appweaver/core';
import { inboxConfig } from './config';
import { submitLines } from './entries';

const logger = createLogger('inbox');

/** The key of the read position of the inbox file, in the Memory provider, so a restart goes on from it. */
const OFFSET_KEY = 'inbox:offset';

/**
 * Submits the lines appended to the inbox file. The file is polled, which also sees the changes of an editor
 * replacing it and of a mounted volume, and its read position is kept in the `Memory` provider, Redis in development
 * and production.
 */
export class InboxWatcher implements OnInit, OnDestroy {
  static [LIFECYCLE] = true;

  private _scanning: Promise<number> = Promise.resolve(0);
  private _watching = false;

  public async onInit(): Promise<void> {
    if (!inboxConfig.WATCH) {
      return;
    }

    // Created empty, so there is a file to append to
    await fsp.appendFile(inboxConfig.FILE_PATH, '');
    await this.scan();

    fs.watchFile(
      inboxConfig.FILE_PATH,
      { interval: inboxConfig.WATCH_INTERVAL },
      () => {
        this.scan().catch((err) => logger.error(err, 'Inbox scan failed'));
      }
    );
    this._watching = true;
    logger.info(`Watching ${inboxConfig.FILE_PATH}`);
  }

  public async onDestroy(): Promise<void> {
    if (this._watching) {
      fs.unwatchFile(inboxConfig.FILE_PATH);
      this._watching = false;
    }
    await this._scanning;
  }

  /**
   * Submits the complete lines appended to the inbox file since the last scan, one scan at a time. A line still being
   * written, without its line break, waits for the next scan, and a truncated file is read again from its start.
   *
   * @return {Promise<number>} The number of lines submitted.
   */
  public scan(): Promise<number> {
    this._scanning = this._scanning.then(
      () => this.read(),
      () => this.read()
    );
    return this._scanning;
  }

  private async read(): Promise<number> {
    const memory = inject(Memory);
    let content: Buffer;
    try {
      content = await fsp.readFile(inboxConfig.FILE_PATH);
    } catch {
      return 0;
    }

    let offset = (await memory.get<number>(OFFSET_KEY)) ?? 0;
    if (offset > content.length) {
      offset = 0;
    }
    const end = content.lastIndexOf('\n') + 1;
    if (end <= offset) {
      return 0;
    }

    const lines = content.subarray(offset, end).toString('utf8').split('\n');
    const entries = await submitLines(lines, 'File');
    await memory.set(OFFSET_KEY, end);
    if (entries.length > 0) {
      logger.info(
        `Lines submitted from ${inboxConfig.FILE_PATH}: ${entries.length}`
      );
    }
    return entries.length;
  }
}
