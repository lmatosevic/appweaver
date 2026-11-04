import {
  IHealthCheck,
  HealthCheckResult,
  HealthCheckConfig
} from '../interfaces';
import { HEALTH_CHECK } from '../constants';

/** A text message, the same for every SMS sender. */
export type SmsMessage = {
  /** The recipient phone number in the E.164 format, i.e. `+385911234567`. */
  to: string;
  /** The text of the message. */
  text: string;
  /** The sender, a phone number or an alphanumeric sender ID, taken from the `sms.sender` config when missing. */
  from?: string;
  /** Options of the SMS driver, i.e. the status callback URL of a sending service. */
  providerOptions?: Record<string, unknown>;
};

/** A text message rendered from a template, the `<template>.txt` template giving its text. */
export type TemplateSms = Omit<SmsMessage, 'text'> & {
  /** The template name without the format, i.e. `sms/order-shipped` for `sms/order-shipped.txt`. */
  template: string;
  /** The data to render the template with. */
  data?: Record<string, any>;
  /** The locale to render the template in. Defaults to the `LOCALE_DEFAULT` config. */
  locale?: string;
};

export abstract class SmsSender implements IHealthCheck {
  static [HEALTH_CHECK] = true;

  /**
   * Sends a text message.
   *
   * @param {SmsMessage} message - The recipient, the text and the optional sender of the message.
   * @return {Promise<boolean>} A promise that resolves to `true` if sent successfully, otherwise should throw an
   * `SmsError` with the `SMS_SEND_FAILED` code.
   */
  abstract sendSms(message: SmsMessage): Promise<boolean>;

  abstract checkHealth(): Promise<HealthCheckResult>;

  public checkHealthConfig(): HealthCheckConfig {
    return { name: 'sms' };
  }
}
