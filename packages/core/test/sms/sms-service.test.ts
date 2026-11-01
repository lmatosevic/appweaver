import { configOverrides, SmsSender } from '@appweaver/common';
import { define } from '../../context/dependency-injection';
import { SmsService } from '../../sms';
import { resetContext } from '../fixtures/context-fixture';

describe('sms-service', () => {
  let sender: { sendSms: jest.Mock };
  let service: SmsService;

  beforeEach(() => {
    resetContext();
    sender = { sendSms: jest.fn(async () => true) };
    define(sender, SmsSender);
    service = new SmsService();
  });

  afterEach(() => {
    delete configOverrides.SMS_SENDER;
  });

  afterAll(() => {
    resetContext();
  });

  describe('sendSms', () => {
    test('sends the message with its own sender', async () => {
      configOverrides.SMS_SENDER = 'Default';

      await service.sendSms({ to: '+1555', text: 'Hi', from: 'Shop' });

      expect(sender.sendSms).toHaveBeenCalledWith({
        to: '+1555',
        text: 'Hi',
        from: 'Shop'
      });
    });

    test('sends the message from the configured sender', async () => {
      configOverrides.SMS_SENDER = 'Default';

      await service.sendSms({ to: '+1555', text: 'Hi' });

      expect(sender.sendSms).toHaveBeenCalledWith({
        to: '+1555',
        text: 'Hi',
        from: 'Default'
      });
    });

    test('leaves the sender to the driver without a configured one', async () => {
      await service.sendSms({ to: '+1555', text: 'Hi' });

      expect(sender.sendSms).toHaveBeenCalledWith({ to: '+1555', text: 'Hi' });
    });

    test('rejects with the error of the driver', async () => {
      sender.sendSms.mockRejectedValue(new Error('Rejected'));

      await expect(
        service.sendSms({ to: '+1555', text: 'Hi' })
      ).rejects.toThrow('Rejected');
    });
  });
});
