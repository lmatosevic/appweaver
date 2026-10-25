import { Email, EmailSender, ErrorCode, MailerError } from '@appweaver/common';
import { mailerConfig } from '../mailer-config';
import { textToHtml } from './html-util';

/**
 * Fills the sender and the HTML body an email may leave out: the sender of {@link formatSender}, and the HTML of the
 * plain text body.
 *
 * @param {Email} email - The email.
 * @return {Email} The email with its sender and HTML body.
 * @throws {MailerError} `MAILER_SENDER_MISSING`, see {@link formatSender}.
 */
export function completeEmail(email: Email): Email & { from: string } {
  return {
    ...email,
    from: formatSender(email.from),
    html: email.html ?? textToHtml(email.text)
  };
}

/**
 * Formats the sender of an email: an address string as it is, otherwise `"name" <address>` from its parts, each one
 * missing taken from the `mailer.senderName` and `mailer.senderAddress` config. The name is quoted and escaped, and
 * without one the sender is the bare address.
 *
 * @param {string | EmailSender} [sender] - The sender of the email.
 * @return {string} The sender address.
 * @throws {MailerError} `MAILER_SENDER_MISSING` if neither the sender nor the config has an address.
 */
export function formatSender(sender?: string | EmailSender): string {
  if (typeof sender === 'string') {
    return sender;
  }

  const address = sender?.address || mailerConfig.SENDER_ADDRESS;
  if (!address) {
    throw new MailerError(
      ErrorCode.MailerSenderMissing,
      'The email has no sender address, set its `from` or the `mailer.senderAddress` config'
    );
  }

  const name = sender?.name ?? mailerConfig.SENDER_NAME;
  if (!name) {
    return address;
  }

  const quoted = name.replace(/[\r\n]+/g, ' ').replace(/["\\]/g, '\\$&');
  return `"${quoted}" <${address}>`;
}
