import { createTransport, Transporter } from 'nodemailer';
import {
  createLogger,
  Email,
  ErrorCode,
  errorMessage,
  HealthCheckResult,
  Mailer,
  MailerError
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

  /**
   * Sends an email through the SMTP server.
   *
   * @throws {MailerError} `MAILER_SEND_FAILED` if the server rejects the email, with its SMTP response code as the
   * `status`, or cannot be reached, `MAILER_SENDER_MISSING` if the email has no sender.
   */
  public async sendEmail(data: Email): Promise<boolean> {
    const { providerOptions, ...email } = completeEmail(data);

    const info = await this._transporter
      .sendMail({ ...providerOptions, ...email })
      .catch((e: { responseCode?: number; code?: string }) => {
        throw new MailerError(
          ErrorCode.MailerSendFailed,
          `SMTP ${e.responseCode ? 'server rejected the email' : 'request failed'}: ${errorMessage(e)}`,
          {
            provider: 'smtp',
            subject: email.subject,
            status: e.responseCode,
            providerCode: e.code
          },
          { cause: e }
        );
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
      return { success: false, message: errorMessage(e) };
    }
  }
}
