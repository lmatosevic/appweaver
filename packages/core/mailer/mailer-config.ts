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

export const smtpConfig = defineConfig('mailer.smtp', {
  /** SMTP server hostname. Default: `'127.0.0.1'`. */
  HOST: Type.String({ default: '127.0.0.1' }),
  /** SMTP server port. Default: `587`. */
  PORT: Type.Integer({ default: 587 }),
  /** Use TLS/SSL for SMTP connections. Default: `false`. */
  SECURE: Type.Boolean({ default: false }),
  /** SMTP authentication username. */
  USER: Type.Optional(Type.String()),
  /** SMTP authentication password. */
  PASSWORD: Type.Optional(Type.String())
});
