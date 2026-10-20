import { Mailer } from '@appweaver/common';
import { ContractFactory } from './contract-util';

/**
 * Tests a `Mailer` driver against the behavior every driver shares, with the `describe` and `test` globals of Jest,
 * Vitest or Bun. The driver must send to a test inbox or a mocked transport, since the test sends real emails.
 *
 * @param {string} name - The name of the driver, i.e. `SmtpMailer`.
 * @param {ContractFactory<Mailer>} create - Creates the driver.
 */
export function testMailerContract(
  name: string,
  create: ContractFactory<Mailer>
): void {
  describe(`${name} implements the Mailer contract`, () => {
    let mailer: Mailer;

    beforeEach(async () => {
      mailer = await create();
    });

    test('sends an email with every field of the contract', async () => {
      await expect(
        mailer.sendEmail({
          to: ['jane@example.com', 'john@example.com'],
          from: '"Shop" <shop@example.com>',
          cc: 'cc@example.com',
          bcc: ['bcc@example.com'],
          replyTo: 'support@example.com',
          headers: { 'X-Contract': 'appweaver' },
          subject: 'Contract',
          text: 'Plain text',
          html: '<p>HTML</p>',
          attachments: [
            {
              filename: 'note.txt',
              content: 'aGVsbG8=',
              encoding: 'base64',
              contentType: 'text/plain'
            }
          ]
        })
      ).resolves.toBe(true);
    });

    test('reports its health', async () => {
      const result = await mailer.checkHealth();

      expect(typeof result.success).toBe('boolean');
    });
  });
}
