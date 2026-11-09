import { HealthCheckResult, SmsMessage, SmsSender } from '@appweaver/common';
import { {{CONFIG_NAME}} } from './config';

/** The {{MODULE_NAME}} SMS sender, selected with `"sms": { "provider": "{{MODULE_NAME}}" }`. */
export class {{CLASS_NAME}} extends SmsSender {
  /** The messages sent, replace with the call of the sending service, i.e. with {{CONFIG_NAME}}. */
  public readonly sent: SmsMessage[] = [];

  public async sendSms(message: SmsMessage): Promise<boolean> {
    void {{CONFIG_NAME}}.EXAMPLE;
    // A message the service rejects throws an `SmsError` with the `SMS_SEND_FAILED` code and the provider name. The
    // sender is the `sms.sender` config when missing, the default sender of the service without one.
    this.sent.push(message);
    return true;
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    return { success: true };
  }
}
