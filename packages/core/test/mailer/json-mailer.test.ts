import { logger } from '@appweaver/common';
import { JsonMailer } from '../../mailer/json-mailer';

describe('json-mailer', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sendEmail', () => {
    test('logs the email with the size of its attachments', async () => {
      const info = jest
        .spyOn(logger, 'info')
        .mockImplementation(() => undefined);

      const sent = await new JsonMailer().sendEmail({
        to: ['a@b.c'],
        cc: 'c@d.e',
        subject: 'Invoice',
        text: 'Attached',
        attachments: [
          { filename: 'invoice.pdf', content: 'JVBERi0=', encoding: 'base64' }
        ]
      });

      expect(sent).toBe(true);
      expect(info).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['a@b.c'],
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
