import { createTransport, Transporter } from 'nodemailer';
import { Attachment } from 'nodemailer/lib/mailer';
import {
  config,
  Email,
  HealthCheckResult,
  logger,
  Mailer
} from '@appweaver/common';

export class SmtpMailer extends Mailer<Attachment> {
  /** @internal */
  private readonly _transporter: Transporter;

  constructor() {
    super();
    this._transporter = config.MAIL_MOCK_SEND
      ? createTransport({
          jsonTransport: true
        })
      : createTransport({
          host: config.MAIL_SMTP_HOST,
          port: config.MAIL_SMTP_PORT,
          secure: config.MAIL_SMTP_SECURE,
          auth: {
            user: config.MAIL_SMTP_USER,
            pass: config.MAIL_SMTP_PASSWORD
          }
        });
  }

  public async sendEmail(data: Email): Promise<boolean> {
    const { to, subject, text, html, attachments } = data;

    try {
      const msg = await this._transporter.sendMail({
        from: `"${config.MAIL_SENDER_NAME}" <${config.MAIL_SENDER_ADDRESS}>`,
        to,
        subject,
        text,
        html: html ?? `<p style="white-space: pre;">${text}</p>`,
        attachments
      });

      if (config.MAIL_MOCK_SEND) {
        logger.info(JSON.parse(msg.message), `Mock E-mail`);
      }

      return true;
    } catch (e) {
      logger.error(e, `Error sending e-mail`);
      return false;
    }
  }

  async checkHealth(): Promise<HealthCheckResult> {
    try {
      if (config.MAIL_MOCK_SEND) {
        return { success: true };
      }
      const success = await this._transporter.verify();
      return { success };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }
}
