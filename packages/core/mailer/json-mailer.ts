import { createTransport, Transporter } from 'nodemailer';
import { Attachment } from 'nodemailer/lib/mailer';
import {
  config,
  Email,
  HealthCheckResult,
  logger,
  Mailer
} from '@appweaver/common';

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

    try {
      const msg = await this._transporter.sendMail({
        from: `"${config.MAIL_SENDER_NAME}" <${config.MAIL_SENDER_ADDRESS}>`,
        to,
        subject,
        text,
        html: html ?? `<p style="white-space: pre;">${text}</p>`,
        attachments
      });

      logger.info(JSON.parse(msg.message), `Mock E-mail`);

      return true;
    } catch (e) {
      logger.error(e, `Error sending e-mail`);
      return false;
    }
  }

  async checkHealth(): Promise<HealthCheckResult> {
    return { success: true };
  }
}
