import { Email } from '@appweaver/common';
import { mailerConfig } from '../mailer-config';
import { textToHtml } from './html-util';

/**
 * Fills the sender and the HTML body an email may leave out: the sender of the `mailer` config, and the HTML of the
 * plain text body.
 *
 * @param {Email} email - The email.
 * @return {Email} The email with its sender and HTML body.
 */
export function completeEmail(email: Email): Email & { from: string } {
  return {
    ...email,
    from:
      email.from ??
      `"${mailerConfig.SENDER_NAME}" <${mailerConfig.SENDER_ADDRESS}>`,
    html: email.html ?? textToHtml(email.text)
  };
}
