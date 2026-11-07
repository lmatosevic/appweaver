import { appConfig, TemplateEngine } from '@appweaver/common';
import { inject, LocaleService, SmsService } from '@appweaver/core';

/**
 * Sends an account text message through the SMS queue and waits until it is sent, so a rejected number fails the
 * request. It is rendered from the `<template>.txt` template of the application, or without one, or without a template
 * engine, it is the translation of its key.
 *
 * @param {SmsService} smsService - The SMS service sending the message.
 * @param {Object} sms - The recipient, the template, the locale, the code and the minutes it is valid for.
 * @param {string} key - The translation key of the message, i.e. `sms.twoFactorCode`.
 * @return {Promise<void>} A promise that resolves once the message is sent.
 * @throws {SmsError} `SMS_SEND_FAILED` if the provider rejects the message.
 */
export async function sendAccountSms(
  smsService: SmsService,
  sms: {
    to: string;
    template: string;
    code: string;
    expiresInMinutes: number;
    locale?: string;
  },
  key: string
): Promise<void> {
  const { to, template, code, expiresInMinutes, locale } = sms;
  const appName = appConfig.NAME;

  const engine = inject(TemplateEngine, false);
  if (engine && (await engine.hasTemplate(`${template}.txt`, locale))) {
    await smsService.sendSmsAndWait({
      to,
      template,
      data: { code, appName, expiresInMinutes },
      locale
    });
    return;
  }

  const text = inject(LocaleService).translate(key, locale, {
    code,
    appName,
    count: expiresInMinutes
  });
  await smsService.sendSmsAndWait({ to, text });
}
