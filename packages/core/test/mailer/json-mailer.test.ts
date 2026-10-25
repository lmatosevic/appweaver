import { createLogger } from '@appweaver/common';
import { JsonMailer } from '../../mailer/json-mailer';
import { testMailerContract } from '@appweaver/testing';

const logger = createLogger('mailer');

describe('json-mailer', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sendEmail', () => {
    test('logs the email with the size of its attachments', async () => {
      const debug = jest
        .spyOn(logger, 'debug')
        .mockImplementation(() => undefined);

      const sent = await new JsonMailer().sendEmail({
        to: ['a@b.c'],
        from: { name: 'Shop', address: 'shop@example.com' },
        cc: 'c@d.e',
        subject: 'Invoice',
        text: 'Attached',
        attachments: [
          { filename: 'invoice.pdf', content: 'JVBERi0=', encoding: 'base64' }
        ]
      });

      expect(sent).toBe(true);
      expect(debug).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['a@b.c'],
          from: '"Shop" <shop@example.com>',
          cc: 'c@d.e',
          subject: 'Invoice',
          attachments: [
            { filename: 'invoice.pdf', contentType: undefined, size: 8 }
          ]
        }),
        'Mock E-mail'
      );
    });
  });

  describe('checkHealth', () => {
    test('is always up', async () => {
      expect(await new JsonMailer().checkHealth()).toEqual({ success: true });
    });
  });
});

testMailerContract('JsonMailer', () => new JsonMailer());
