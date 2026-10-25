import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const mailerConfig = defineConfig('mailer', {
  /** Display name of the default sender of the emails, which send from the bare address without one. */
  SENDER_NAME: Type.Optional(Type.String()),
  /** Address of the default sender of the emails, required by an enabled mailer, which fails to start without it. */
  SENDER_ADDRESS: Type.Optional(Type.String()),
  /** Mailer provider: `auto` (`smtp` when its module is enabled, otherwise none), `smtp`, `json` (writes the emails
   * into the log, for development and tests), `none`, or the module path of an implementation. Default: `'auto'`. */
  PROVIDER: Type.String({ default: 'auto' })
});
