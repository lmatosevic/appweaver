import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const mailerConfig = defineConfig('mailer', {
  /** Default sender name for outgoing emails. */
  SENDER_NAME: Type.Optional(Type.String()),
  /** Default sender email address. */
  SENDER_ADDRESS: Type.Optional(Type.String()),
  /** Mailer provider: `auto` (`smtp` when its module is enabled, otherwise none), `smtp`, `json` (writes the emails
   * into the log, for development and tests), `none`, or the module path of an implementation. Default: `'auto'`. */
  PROVIDER: Type.String({ default: 'auto' })
});
