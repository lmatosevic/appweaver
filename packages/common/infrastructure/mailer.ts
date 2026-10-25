import {
  IHealthCheck,
  HealthCheckResult,
  HealthCheckConfig
} from '../interfaces';
import { HEALTH_CHECK } from '../constants';

/** A file attached to an email, the same for every mailer. */
export type EmailAttachment = {
  /** The file name shown to the recipient. */
  filename: string;
  /** The content, a text or a buffer. A queued email keeps a buffer as a `base64` string with its `encoding`. */
  content: string | Buffer;
  /** The MIME type, derived from the file name by most mailers when missing. */
  contentType?: string;
  /** The encoding of a string content, i.e. `base64` for a binary file. */
  encoding?: 'base64' | 'utf8';
};

/** The parts of a sender, each one missing taken from the `mailer.senderName` and `mailer.senderAddress` config. */
export type EmailSender = {
  /** The display name, i.e. `Jane via Acme`. An empty name sends from the bare address. */
  name?: string;
  /** The address, on a domain the mailer is allowed to send from. */
  address?: string;
};

/** The sender, the recipients and the headers of an email, besides its content. */
export type EmailEnvelope = {
  /** The recipient addresses, i.e. `jane@example.com` or `"Jane" <jane@example.com>`. */
  to: string | string[];
  /** The sender, as an address (`"Jane" <jane@example.com>`, used as it is) or its parts, completed by the
   * `mailer.senderName` and `mailer.senderAddress` config, which is the sender when missing. */
  from?: string | EmailSender;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  /** Additional headers of the email. */
  headers?: Record<string, string>;
  attachments?: EmailAttachment[];
  /** Options of the mailer driver, i.e. the tags of a sending service. */
  providerOptions?: Record<string, unknown>;
};

export type Email = EmailEnvelope & {
  subject: string;
  text: string;
  html?: string;
};

export type TemplateEmail = EmailEnvelope & {
  /** The template name without the format, i.e. `emails/order-shipped`. Its `.html`, `.txt` and `.subject` templates
   * render the HTML body, the plain text body and the subject of the email. */
  template: string;
  /** The data to render the templates with. */
  data?: Record<string, any>;
  /** The locale to render the templates in. Defaults to the `LOCALE_DEFAULT` config. */
  locale?: string;
  /** The subject, used instead of the rendered `.subject` template. */
  subject?: string;
};

export abstract class Mailer implements IHealthCheck {
  static [HEALTH_CHECK] = true;

  /**
   * Sends an email using the provided email object.
   *
   * @param {Email} data - The email payload including recipients, subject, and body.
   * @return {Promise<boolean>} A promise that resolves to `true` if sent successfully, otherwise should throw an
   * error.
   */
  abstract sendEmail(data: Email): Promise<boolean>;

  abstract checkHealth(): Promise<HealthCheckResult>;

  public checkHealthConfig(): HealthCheckConfig {
    return { name: 'mailer' };
  }
}
