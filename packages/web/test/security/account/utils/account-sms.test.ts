import { configOverrides, TemplateEngine } from '@appweaver/common';
import { define, LocaleService, SmsService } from '@appweaver/core';
import { resetContext } from '@appweaver/testing';
import { sendAccountSms } from '../../../../security/account/utils/account-sms';

describe('sendAccountSms', () => {
  let sendSmsAndWait: jest.Mock;
  let hasTemplate: jest.Mock;
  const sms = {
    to: '+385911234567',
    template: 'sms/two-factor-code',
    code: '123456',
    expiresInMinutes: 5,
    locale: 'en'
  };

  beforeEach(() => {
    resetContext();
    define(LocaleService);
    sendSmsAndWait = jest.fn().mockResolvedValue(true);
    hasTemplate = jest.fn().mockResolvedValue(true);
    configOverrides.APP_NAME = 'Shop';
  });

  afterEach(() => {
    delete configOverrides.APP_NAME;
  });

  afterAll(() => {
    resetContext();
  });

  test('sends the template of the application and waits for it', async () => {
    define({ hasTemplate }, TemplateEngine as any);

    await sendAccountSms(
      { sendSmsAndWait } as unknown as SmsService,
      sms,
      'sms.twoFactorCode'
    );

    expect(hasTemplate).toHaveBeenCalledWith('sms/two-factor-code.txt', 'en');
    expect(sendSmsAndWait).toHaveBeenCalledWith({
      to: '+385911234567',
      template: 'sms/two-factor-code',
      data: { code: '123456', appName: 'Shop', expiresInMinutes: 5 },
      locale: 'en'
    });
  });

  test('sends the translation without a template of the application', async () => {
    hasTemplate.mockResolvedValue(false);
    define({ hasTemplate }, TemplateEngine as any);

    await sendAccountSms(
      { sendSmsAndWait } as unknown as SmsService,
      sms,
      'sms.twoFactorCode'
    );

    expect(sendSmsAndWait).toHaveBeenCalledWith({
      to: '+385911234567',
      text: '123456 is your Shop verification code. It expires in 5 minutes.'
    });
  });

  test('sends the translation without a template engine', async () => {
    await sendAccountSms(
      { sendSmsAndWait } as unknown as SmsService,
      { ...sms, expiresInMinutes: 1 },
      'sms.verifyPhone'
    );

    expect(sendSmsAndWait).toHaveBeenCalledWith({
      to: '+385911234567',
      text: '123456 is your Shop phone verification code. It expires in 1 minute.'
    });
  });
});
