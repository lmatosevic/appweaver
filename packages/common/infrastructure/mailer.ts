import {
  IHealthCheck,
  HealthCheckResult,
  HealthCheckConfig
} from '../interfaces';
import { HEALTH_CHECK } from '../constants';

export type Email<Attachment = any> = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Attachment[];
};

export abstract class Mailer<Attachment = any> implements IHealthCheck {
  static [HEALTH_CHECK] = true;

  /**
   * Sends an email using the provided email object.
   *
   * @param {Email} data - The email payload including recipients, subject, and body.
   * @returns {Promise<boolean>} A promise that resolves to `true` if sent successfully, otherwise should throw an
   * error.
   */
  abstract sendEmail(data: Email<Attachment>): Promise<boolean>;

  abstract checkHealth(): Promise<HealthCheckResult>;

  public checkHealthConfig(): HealthCheckConfig {
    return { name: 'mailer' };
  }
}
