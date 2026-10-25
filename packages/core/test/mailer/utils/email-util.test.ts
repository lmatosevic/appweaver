import { configOverrides, ErrorCode } from '@appweaver/common';
import { completeEmail, formatSender } from '../../../mailer/utils/email-util';

describe('email-util', () => {
  afterEach(() => {
    delete configOverrides.MAILER_SENDER_NAME;
    delete configOverrides.MAILER_SENDER_ADDRESS;
  });

  describe('completeEmail', () => {
    test('fills the sender of the config and the HTML of the text', () => {
      configOverrides.MAILER_SENDER_NAME = 'Shop';
      configOverrides.MAILER_SENDER_ADDRESS = 'shop@example.com';

      const email = completeEmail({
        to: 'a@b.c',
        subject: 'Hi',
        text: 'Hello'
      });

      expect(email.from).toBe('"Shop" <shop@example.com>');
      expect(email.html).toContain('Hello');
    });

    test('keeps the sender and the HTML of the email', () => {
      const email = completeEmail({
        to: 'a@b.c',
        from: 'team@example.com',
        subject: 'Hi',
        text: 'Hello',
        html: '<b>Hello</b>'
      });

      expect(email.from).toBe('team@example.com');
      expect(email.html).toBe('<b>Hello</b>');
    });

    test('rejects an email without a sender address', () => {
      expect(() =>
        completeEmail({ to: 'a@b.c', subject: 'Hi', text: 'Hello' })
      ).toThrow(
        expect.objectContaining({ code: ErrorCode.MailerSenderMissing })
      );
    });
  });

  describe('formatSender', () => {
    beforeEach(() => {
      configOverrides.MAILER_SENDER_NAME = 'Shop';
      configOverrides.MAILER_SENDER_ADDRESS = 'shop@example.com';
    });

    test('keeps an address string as it is', () => {
      expect(formatSender('"Team" <team@example.com>')).toBe(
        '"Team" <team@example.com>'
      );
    });

    test('takes the missing parts from the config', () => {
      expect(formatSender({ name: 'Jane via Shop' })).toBe(
        '"Jane via Shop" <shop@example.com>'
      );
      expect(formatSender({ address: 'orders@example.com' })).toBe(
        '"Shop" <orders@example.com>'
      );
    });

    test('formats the bare address without a name', () => {
      delete configOverrides.MAILER_SENDER_NAME;

      expect(formatSender()).toBe('shop@example.com');
      expect(formatSender({ name: 'Jane' })).toBe('"Jane" <shop@example.com>');
    });

    test('formats the bare address with an empty name', () => {
      expect(formatSender({ name: '' })).toBe('shop@example.com');
    });

    test('escapes the quotes and backslashes and joins the lines of the name', () => {
      expect(formatSender({ name: 'Jane "J\\D"\r\nDoe' })).toBe(
        '"Jane \\"J\\\\D\\" Doe" <shop@example.com>'
      );
    });

    test('rejects a sender without an address', () => {
      configOverrides.MAILER_SENDER_ADDRESS = '';

      expect(() => formatSender({ name: 'Jane' })).toThrow(
        expect.objectContaining({ code: ErrorCode.MailerSenderMissing })
      );
    });
  });
});
