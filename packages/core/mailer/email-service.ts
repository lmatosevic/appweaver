import { Email, logger, Mailer, Queue, QueueJob } from '@appweaver/common';
import { inject } from '../context';

export class EmailService {
  /** @internal */
  private readonly _mailer = inject(Mailer);
  /** @internal */
  private readonly _mailQueue = inject(Queue).get<Email, boolean>('email');
  /** @internal */
  private readonly _waitedJobs = new Map<
    string,
    { resolve: (success: boolean) => void; reject: (error: Error) => void }
  >();

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

  /**
   * Sends bulk emails by queuing them for asynchronous processing.
   *
   * @param {Email[]} email - An array of email objects to be sent in bulk.
   * @return {Promise<void>} A promise that resolves when the bulk email jobs are successfully queued.
   */
  public async sendEmailBulk(email: Email[]): Promise<void> {
    await this._mailQueue.sendBulkJobs(email.map((e) => ({ data: e })));
  }

  /**
   * Sends bulk emails and waits for all of them to finish.
   *
   * @param {Email[]} emails - An array of email objects to be sent.
   * @return {Promise<{ success: boolean; error?: Error }[]>} A promise that resolves with an array of results, each
   * containing `success` and an optional `error`.
   */
  public async sendEmailBulkAndWait(
    emails: Email[]
  ): Promise<{ success: boolean; error?: Error }[]> {
    const results = await Promise.allSettled(
      emails.map((email) => this.sendEmailAndWait(email))
    );

    return results.map((result) =>
      result.status === 'fulfilled'
        ? { success: true }
        : { success: false, error: result.reason }
    );
  }

  /**
   * Sends an email and waits for the sending process to finish.
   *
   * @param {Email} email - The email object containing the details of the email to be sent.
   * @return A promise that resolves with `true` when the email is sent successfully, or rejects if sending fails.
   */
  public async sendEmailAndWait(email: Email): Promise<boolean> {
    const job = await this._mailQueue.sendJob(email);

    return new Promise<boolean>((resolve, reject) => {
      if (!job.id) {
        return reject(
          new Error('Email Job not found. Email could still be sent.')
        );
      }
      this._waitedJobs.set(job.id, { resolve, reject });
    }).finally(() => {
      if (job.id) {
        this._waitedJobs.delete(job.id);
      }
    });
  }

  /** @internal */
  private async processEmail(job: QueueJob<Email, boolean>): Promise<boolean> {
    return this._mailer.sendEmail(job.data);
  }

  /** @internal */
  private onEmailSent(job: QueueJob<Email, boolean>): void {
    if (job.id) {
      const resolver = this._waitedJobs.get(job.id);
      resolver?.resolve(true);
    }

    logger.debug(`E-mail '${job.data.subject}' sent successfully`);
  }

  /** @internal */
  private onEmailError(
    job: QueueJob<Email, boolean> | undefined,
    error: Error
  ): void {
    if (job?.id) {
      const resolver = this._waitedJobs.get(job.id);
      resolver?.reject(error);
    }

    logger.error(error, `E-mail '${job?.data.subject}' sending failed`);
  }
}
