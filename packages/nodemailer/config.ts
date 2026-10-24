import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

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
