import { Email, logger, Mailer, Queue, QueueJob } from '@appweaver/common';
import { inject } from '../context';

export class EmailService {
  /** @internal */
  private readonly _mailer = inject(Mailer);
  /** @internal */
  private readonly _mailQueue = inject(Queue).get<Email, boolean>('email');

  constructor() {
    this._mailQueue.addWorker(this.processEmail.bind(this));
    this._mailQueue.onCompleted(this.onEmailSent.bind(this));
    this._mailQueue.onFailed(this.onEmailError.bind(this));
  }

  public async sendEmail(email: Email) {
    await this._mailQueue.sendJob(email);
  }

  private async processEmail(job: QueueJob<Email, boolean>): Promise<boolean> {
    return await this._mailer.sendEmail(job.data);
  }

  private onEmailSent(job: QueueJob<Email, boolean>): void {
    logger.trace(`E-mail '${job.data.subject}' sent successfully`);
  }

  private onEmailError(
    job: QueueJob<Email, boolean> | undefined,
    error: Error
  ): void {
    logger.error(error, `E-mail '${job?.data.subject}' sending failed`);
  }
}
