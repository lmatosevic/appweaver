import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

/** The config of the inbox module, read from config.inbox and the INBOX_* variables. */
export const inboxConfig = defineConfig('inbox', {
  /** The text file whose appended lines are submitted to the inbox. Default: `'./inbox.txt'`. */
  FILE_PATH: Type.String({ default: './inbox.txt' }),
  /** The text file a line of results is appended to for every processed entry. Default: `'./outbox.txt'`. */
  OUTBOX_PATH: Type.String({ default: './outbox.txt' }),
  /** Watch the inbox file, otherwise it is read only when `POST /api/inbox/scan` asks. Default: `true`. */
  WATCH: Type.Boolean({ default: true }),
  /** How often the watched file is checked for changes, in milliseconds. Default: `500`. */
  WATCH_INTERVAL: Type.Integer({ default: 500, minimum: 50 }),
  /** The attempts of an entry, the first one included, before it fails. Default: `3`. */
  MAX_ATTEMPTS: Type.Integer({ default: 3, minimum: 1 }),
  /** The wait between two attempts of an entry, in milliseconds. Default: `1000`. */
  RETRY_DELAY: Type.Integer({ default: 1000, minimum: 0 })
});
