import {
  Email,
  HealthCheckResult,
  createLogger,
  Mailer
} from '@appweaver/common';
import { completeEmail } from './utils/email-util';

const logger = createLogger('mailer');

/** Writes the emails into the log instead of sending them, for development and tests. */
export class JsonMailer extends Mailer {
  public async sendEmail(data: Email): Promise<boolean> {
    const { attachments, ...email } = completeEmail(data);

    logger.debug(
      {
        ...email,
        attachments: attachments?.map(({ filename, contentType, content }) => ({
          filename,
          contentType,
          size: content.length
        }))
      },
      `Mock E-mail`
    );

    return true;
  }

  async checkHealth(): Promise<HealthCheckResult> {
    return { success: true };
  }
}
