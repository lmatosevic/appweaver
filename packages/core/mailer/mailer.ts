import { createTransport, Transporter } from 'nodemailer';
import { Attachment } from 'nodemailer/lib/mailer';
import { config, logger } from '@appweaver/common';

export type Email = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Attachment[];
};

export class Mailer {
  private transporter: Transporter;

  constructor() {
    this.transporter = config.MAIL_MOCK_SEND
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
      const msg = await this.transporter.sendMail({
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
}

const mailer = new Mailer();

export { mailer };
