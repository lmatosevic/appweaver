import { Email, HealthCheckResult, Mailer } from '@appweaver/common';
import { {{CONFIG_NAME}} } from './config';

/** The {{MODULE_NAME}} mailer, selected with `"mailer": { "provider": "{{MODULE_NAME}}" }`. */
export class {{CLASS_NAME}} extends Mailer {
  /** The emails sent, replace with the call of the sending service, i.e. with {{CONFIG_NAME}}. */
  public readonly sent: Email[] = [];

  public async sendEmail(data: Email): Promise<boolean> {
    void {{CONFIG_NAME}}.EXAMPLE;
    this.sent.push(data);
    return true;
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    return { success: true };
  }
}
