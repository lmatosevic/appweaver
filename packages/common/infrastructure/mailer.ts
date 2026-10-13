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

export type TemplateEmail<Attachment = any> = {
  /** The recipient address. */
  to: string;
  /** The template name without the format, i.e. `emails/order-shipped`. Its `.html`, `.txt` and `.subject` templates
   * render the HTML body, the plain text body and the subject of the email. */
  template: string;
  /** The data to render the templates with. */
  data?: Record<string, any>;
  /** The locale to render the templates in. Defaults to the `LOCALE_DEFAULT` config. */
  locale?: string;
  /** The subject, used instead of the rendered `.subject` template. */
  subject?: string;
  attachments?: Attachment[];
};

export abstract class Mailer<Attachment = any> implements IHealthCheck {
  static [HEALTH_CHECK] = true;

  /**
   * Sends an email using the provided email object.
   *
   * @param {Email} data - The email payload including recipients, subject, and body.
   * @return {Promise<boolean>} A promise that resolves to `true` if sent successfully, otherwise should throw an
   * error.
   */
  abstract sendEmail(data: Email<Attachment>): Promise<boolean>;

  abstract checkHealth(): Promise<HealthCheckResult>;

  public checkHealthConfig(): HealthCheckConfig {
    return { name: 'mailer' };
  }
}
