import { configOverrides } from '@appweaver/common';
import { completeEmail } from '../../../mailer/utils/email-util';

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
  });
});
