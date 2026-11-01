import {
  createLogger,
  HealthCheckResult,
  SmsMessage,
  SmsSender
} from '@appweaver/common';

const logger = createLogger('sms');

/** Writes the text messages into the log instead of sending them, for development and tests. */
export class JsonSms extends SmsSender {
  public async sendSms(message: SmsMessage): Promise<boolean> {
    logger.debug(message, 'Mock SMS');

    return true;
  }

  async checkHealth(): Promise<HealthCheckResult> {
    return { success: true };
  }
}
