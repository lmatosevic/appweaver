import { SmsSender } from '@appweaver/common';
import { ContractFactory, runner } from './contract-util';

/**
 * Tests an `SmsSender` driver against the behavior every driver shares, with the `describe` and `test` globals of
 * Jest, Vitest or Bun. The driver must send to a test number or a mocked API, since the test sends real messages.
 *
 * @param {string} name - The name of the driver, i.e. `TwilioSms`.
 * @param {ContractFactory<SmsSender>} create - Creates the driver.
 */
export function testSmsContract(
  name: string,
  create: ContractFactory<SmsSender>
): void {
  const { describe, test, expect, beforeEach } = runner();

  describe(`${name} implements the SmsSender contract`, () => {
    let sender: SmsSender;

    beforeEach(async () => {
      sender = await create();
    });

    test('sends a text message with every field of the contract', async () => {
      await expect(
        sender.sendSms({
          to: '+15005550006',
          text: 'Your code is 123456',
          from: '+15005550001',
          providerOptions: {}
        })
      ).resolves.toBe(true);
    });

    test('sends a text message without a sender', async () => {
      await expect(
        sender.sendSms({ to: '+15005550006', text: 'Hello' })
      ).resolves.toBe(true);
    });

    test('names its health check', () => {
      expect(sender.checkHealthConfig().name).toBe('sms');
    });

    test('reports its health', async () => {
      const result = await sender.checkHealth();

      expect(typeof result.success).toBe('boolean');
    });
  });
}
