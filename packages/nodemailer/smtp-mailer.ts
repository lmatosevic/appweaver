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
   * @param {Email} data - The email to send.
   * @return {Promise<boolean>} `true` once the server accepts the email.
   * @throws {MailerError} `MAILER_SEND_FAILED` if the server rejects the email or cannot be reached, with the SMTP
   * response code as the `status` and the error code of Nodemailer as the `providerCode`, `MAILER_SENDER_MISSING` if
   * the email has no sender.
   */
  public async sendEmail(data: Email): Promise<boolean> {
    const { providerOptions, ...email } = completeEmail(data);

    let info: { messageId?: string; response?: string };
    try {
      info = await this._transporter.sendMail({
        ...providerOptions,
        ...email
      });
    } catch (e) {
      const { responseCode, code } = e as {
        responseCode?: number;
        code?: string;
      };
      throw new MailerError(
        ErrorCode.MailerSendFailed,
        `SMTP server rejected the email: ${errorMessage(e)}`,
        {
          provider: 'smtp',
          subject: email.subject,
          status: responseCode,
          providerCode: code
        },
        { cause: e }
      );
    }
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
