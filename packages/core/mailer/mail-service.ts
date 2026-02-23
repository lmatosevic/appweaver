import { Job } from 'bullmq';
import { logger } from '@appweaver/common';
import { Email, mailer } from './mailer';
import { queue } from '../queue';

export class EmailService {
  private readonly mailQueue = queue.get<Email, boolean>('email');

  constructor() {
    this.mailQueue.addWorker(this.processEmail.bind(this));
    this.mailQueue.onCompleted(this.onEmailSent.bind(this));
    this.mailQueue.onFailed(this.onEmailError.bind(this));
  }

  public async sendEmail(email: Email) {
    await this.mailQueue.sendJob(email);
  }

  private async processEmail(job: Job<Email, boolean>): Promise<boolean> {
    return await mailer.sendEmail(job.data);
  }

  private onEmailSent(job: Job<Email, boolean>): void {
    logger.info(`E-mail '${job.data.subject}' sent successfully`);
  }

  private onEmailError(
    job: Job<Email, boolean> | undefined,
    error: Error
  ): void {
    logger.error(
      `E-mail '${job?.data.subject}' sending failed: ${error.message}`
    );
  }
}

const emailService = new EmailService();

export { emailService };
