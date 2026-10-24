import { createTransport, Transporter } from 'nodemailer';
import { Attachment } from 'nodemailer/lib/mailer';
import { Email, HealthCheckResult, Mailer } from '@appweaver/common';
import { mailerConfig, smtpConfig } from './mailer-config';
import { textToHtml } from './utils/html-util';

export class SmtpMailer extends Mailer<Attachment> {
  /** @internal */
  private readonly _transporter: Transporter;

  constructor() {
    super();
    this._transporter = createTransport({
      host: smtpConfig.HOST,
      port: smtpConfig.PORT,
      secure: smtpConfig.SECURE,
      auth: {
        user: smtpConfig.USER,
        pass: smtpConfig.PASSWORD
      }
    });
  }

  public async sendEmail(data: Email): Promise<boolean> {
    const { to, subject, text, html, attachments } = data;

    await this._transporter.sendMail({
      from: `"${mailerConfig.SENDER_NAME}" <${mailerConfig.SENDER_ADDRESS}>`,
      to,
      subject,
      text,
      html: html ?? textToHtml(text),
      attachments
    });

    return true;
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
