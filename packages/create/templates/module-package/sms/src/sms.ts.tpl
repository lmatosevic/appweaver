import { HealthCheckResult, SmsMessage, SmsSender } from '@appweaver/common';
import { {{CONFIG_NAME}} } from './config';

/** The {{MODULE_NAME}} SMS sender, selected with `"sms": { "provider": "{{MODULE_NAME}}" }`. */
export class {{CLASS_NAME}} extends SmsSender {
  /** The messages sent, replace with the call of the sending service, i.e. with {{CONFIG_NAME}}. */
  public readonly sent: SmsMessage[] = [];

  public async sendSms(message: SmsMessage): Promise<boolean> {
    void {{CONFIG_NAME}}.EXAMPLE;
    // A rejected message throws an SmsError with SMS_SEND_FAILED and the provider name. Without `from`, send from
    // the default sender of the service.
    this.sent.push(message);
    return true;
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    return { success: true };
  }
}
