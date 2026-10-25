import { createTransport, Transporter } from 'nodemailer';
import {
  createLogger,
  Email,
  HealthCheckResult,
  Mailer
} from '@appweaver/common';
import { completeEmail } from '@appweaver/core';
import { smtpConfig } from './config';

const logger = createLogger('mailer');

export class SmtpMailer extends Mailer {
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
    const { providerOptions, ...email } = completeEmail(data);

    const info = await this._transporter.sendMail({
      ...providerOptions,
      ...email
    });
    logger.debug(
      { messageId: info.messageId, response: info.response },
      'SMTP message accepted'
    );

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
