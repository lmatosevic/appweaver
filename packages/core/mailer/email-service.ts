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

  /**
   * Sends an email by adding it to the mail queue for processing.
   *
   * @param {Email} email - The email object containing the details of the email to be sent.
   * @return A promise that resolves when the email is successfully added to the queue.
   */
  public async sendEmail(email: Email): Promise<void> {
    await this._mailQueue.sendJob(email);
  }

  private async processEmail(job: QueueJob<Email, boolean>): Promise<boolean> {
    return await this._mailer.sendEmail(job.data);
  }

  private onEmailSent(job: QueueJob<Email, boolean>): void {
    logger.debug(`E-mail '${job.data.subject}' sent successfully`);
  }

  private onEmailError(
    job: QueueJob<Email, boolean> | undefined,
    error: Error
  ): void {
    logger.error(error, `E-mail '${job?.data.subject}' sending failed`);
  }
}
