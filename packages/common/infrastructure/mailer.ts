import {
  IHealthCheck,
  HealthCheckResult,
  HealthCheckConfig
} from '../interfaces';
import { HEALTH_CHECK } from '../constants';

export type Email<Attachment = any> = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Attachment[];
};

export abstract class Mailer<Attachment = any> implements IHealthCheck {
  static [HEALTH_CHECK] = true;

  abstract sendEmail(data: Email<Attachment>): Promise<boolean>;

  abstract checkHealth(): Promise<HealthCheckResult>;

  public checkHealthConfig(): HealthCheckConfig {
    return { name: 'mailer' };
  }
}
