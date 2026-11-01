import { createLogger, SmsMessage, SmsSender } from '@appweaver/common';
import { inject } from '../context';
import { smsConfig } from './sms-config';

const logger = createLogger('sms');

export class SmsService {
  /** @internal */
  private readonly _smsSender = inject(SmsSender);

  /**
   * Sends a text message right away, so a failure, i.e. a phone number the provider rejects, reaches the caller. A
   * message without a sender is sent from the `sms.sender` config, or the default sender of the driver.
   *
   * @param {SmsMessage} message - The recipient, the text and the optional sender of the message.
   * @return {Promise<void>} A promise that resolves when the message is sent.
   * @throws {SmsError} `SMS_SEND_FAILED` if the provider rejects the message.
   */
  public async sendSms(message: SmsMessage): Promise<void> {
    const from = message.from ?? smsConfig.SENDER;

    await this._smsSender.sendSms(from ? { ...message, from } : message);

    logger.debug({ length: message.text.length }, 'SMS sent');
  }
}
