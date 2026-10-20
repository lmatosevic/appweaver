import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const mailerConfig = defineConfig('mailer', {
  /** Enable the mailer and the email features, disable it when the `nodemailer` package is not installed. Default: `true`. */
  ENABLED: Type.Boolean({ default: true }),
  /** Default sender name for outgoing emails. */
  SENDER_NAME: Type.Optional(Type.String()),
  /** Default sender email address. */
  SENDER_ADDRESS: Type.Optional(Type.String()),
  /** Mailer provider implementation path. Default: `'@appweaver/core/mailer/smtp-mailer'`. */
  PROVIDER: Type.String({
    default: '@appweaver/core/mailer/smtp-mailer'
  })
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
