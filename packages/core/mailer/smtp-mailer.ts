import { createTransport, Transporter } from 'nodemailer';
import { Email, HealthCheckResult, Mailer } from '@appweaver/common';
import { smtpConfig } from './mailer-config';
import { completeEmail } from './utils/email-util';

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

    await this._transporter.sendMail({ ...providerOptions, ...email });

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
