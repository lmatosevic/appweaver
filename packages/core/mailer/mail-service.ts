import { Job } from 'bullmq';
import { logger } from '@appweaver/common';
import { Email, Mailer } from './mailer';
import { inject } from '../context';
import { Queue } from '../queue';

export class EmailService {
  private readonly mailer = inject(Mailer);
  private readonly mailQueue = inject(Queue).get<Email, boolean>('email');

  constructor() {
    this.mailQueue.addWorker(this.processEmail.bind(this));
    this.mailQueue.onCompleted(this.onEmailSent.bind(this));
    this.mailQueue.onFailed(this.onEmailError.bind(this));
  }

  public async sendEmail(email: Email) {
    await this.mailQueue.sendJob(email);
  }

  private async processEmail(job: Job<Email, boolean>): Promise<boolean> {
    return await this.mailer.sendEmail(job.data);
  }

  private onEmailSent(job: Job<Email, boolean>): void {
    logger.trace(`E-mail '${job.data.subject}' sent successfully`);
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
