import { configOverrides, ErrorCode, MailerError } from '@appweaver/common';
import { testMailerContract } from '@appweaver/testing';

const sendMail = jest.fn();
const verify = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail, verify }))
}));

import { SmtpMailer } from '../smtp-mailer';

const email = { to: 'jane@example.com', subject: 'Welcome', text: 'Hello' };

describe('smtp-mailer', () => {
  beforeEach(() => {
    configOverrides.MAILER_SENDER_ADDRESS = 'shop@example.com';
    sendMail.mockReset().mockResolvedValue({ messageId: '<1@example.com>' });
    verify.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    delete configOverrides.MAILER_SENDER_ADDRESS;
  });

  testMailerContract('SmtpMailer', () => new SmtpMailer());

  describe('sendEmail', () => {
    test('sends the email with its sender, HTML body and provider options', async () => {
      await new SmtpMailer().sendEmail({
        ...email,
        providerOptions: { priority: 'high' }
      });

      expect(sendMail).toHaveBeenCalledWith({
        ...email,
        priority: 'high',
        from: 'shop@example.com',
        html: expect.stringContaining('Hello')
      });
    });

    test('wraps a rejected email in a mailer error naming the provider', async () => {
      const cause = Object.assign(new Error('Mailbox unavailable'), {
        responseCode: 550,
        code: 'EENVELOPE'
      });
      sendMail.mockRejectedValue(cause);

      const error = await new SmtpMailer().sendEmail(email).catch((e) => e);

      expect(error).toBeInstanceOf(MailerError);
      expect(error).toMatchObject({
        code: ErrorCode.MailerSendFailed,
        details: {
          provider: 'smtp',
          subject: 'Welcome',
          status: 550,
          providerCode: 'EENVELOPE'
        },
        cause
      });
    });

    test('fails without a sender before connecting', async () => {
      delete configOverrides.MAILER_SENDER_ADDRESS;

      await expect(new SmtpMailer().sendEmail(email)).rejects.toMatchObject({
        code: ErrorCode.MailerSenderMissing
      });
      expect(sendMail).not.toHaveBeenCalled();
    });
  });

  describe('checkHealth', () => {
    test('reports the error of the connection', async () => {
      verify.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(new SmtpMailer().checkHealth()).resolves.toEqual({
        success: false,
        message: 'ECONNREFUSED'
      });
    });
  });
});
