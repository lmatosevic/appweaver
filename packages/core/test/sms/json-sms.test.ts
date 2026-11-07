import { createLogger } from '@appweaver/common';
import { testSmsContract } from '@appweaver/testing';
import { JsonSms } from '../../sms/json-sms';

const logger = createLogger('sms');

describe('json-sms', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sendSms', () => {
    test('logs the message', async () => {
      const debug = jest
        .spyOn(logger, 'debug')
        .mockImplementation(() => undefined);

      const sent = await new JsonSms().sendSms({
        to: '+385911234567',
        text: 'Your code is 123456',
        from: 'Appweaver'
      });

      expect(sent).toBe(true);
      expect(debug).toHaveBeenCalledWith(
        { to: '+385911234567', text: 'Your code is 123456', from: 'Appweaver' },
        'Mock SMS'
      );
    });
  });

  describe('checkHealth', () => {
    test('is always up', async () => {
      expect(await new JsonSms().checkHealth()).toEqual({ success: true });
    });
  });
});

testSmsContract('JsonSms', () => new JsonSms());
