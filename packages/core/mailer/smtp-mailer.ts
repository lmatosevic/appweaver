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
    this._transporter = createTransport({
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
      await this._transporter.sendMail({
        from: `"${config.MAIL_SENDER_NAME}" <${config.MAIL_SENDER_ADDRESS}>`,
        to,
        subject,
        text,
        html: html ?? `<p style="white-space: pre;">${text}</p>`,
        attachments
      });

      return true;
    } catch (error) {
      logger.error(error, `Error sending e-mail`);
      return false;
    }
  }

  async checkHealth(): Promise<HealthCheckResult> {
    try {
      const success = await this._transporter.verify();
      return { success };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }
}
