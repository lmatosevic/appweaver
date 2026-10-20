import { createTransport, Transporter } from 'nodemailer';
import { Attachment } from 'nodemailer/lib/mailer';
import { Email, HealthCheckResult, logger, Mailer } from '@appweaver/common';
import { mailerConfig } from './mailer-config';
import { textToHtml } from './utils/html-util';

export class JsonMailer extends Mailer<Attachment> {
  /** @internal */
  private readonly _transporter: Transporter;

  constructor() {
    super();
    this._transporter = createTransport({
      jsonTransport: true
    });
  }

  public async sendEmail(data: Email): Promise<boolean> {
    const { to, subject, text, html, attachments } = data;

    const msg = await this._transporter.sendMail({
      from: `"${mailerConfig.SENDER_NAME}" <${mailerConfig.SENDER_ADDRESS}>`,
      to,
      subject,
      text,
      html: html ?? textToHtml(text),
      attachments
    });

    logger.info(JSON.parse(msg.message), `Mock E-mail`);

    return true;
  }

  async checkHealth(): Promise<HealthCheckResult> {
    return { success: true };
  }
}
