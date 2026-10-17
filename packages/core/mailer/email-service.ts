import {
  Email,
  ErrorCode,
  logger,
  Mailer,
  Queue,
  QueueJob,
  TemplateEmail,
  TemplateEngine
} from '@appweaver/common';
import { inject } from '../context';
import { TemplateError } from '../template/template-error';
import { MailerError } from './mailer-error';
import { htmlToText } from './utils/html-util';

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
          new MailerError(
            ErrorCode.MailerJobNotFound,
            'Email Job not found. Email could still be sent.'
          )
        );
      }
      this._waitedJobs.set(job.id, { resolve, reject });
    }).finally(() => {
      if (job.id) {
        this._waitedJobs.delete(job.id);
      }
    });
  }

  /**
   * Renders the email with {@link renderTemplateEmail} and adds it to the mail queue.
   *
   * @param {TemplateEmail} email - The recipient, template name, data and locale of the email.
   * @return A promise that resolves when the email is successfully added to the queue.
   * @throws {TemplateError} See {@link renderTemplateEmail}.
   */
  public async sendTemplateEmail(email: TemplateEmail): Promise<void> {
    await this.sendEmail(await this.renderTemplateEmail(email));
  }

  /**
   * Renders the templates of an email into the email to send, i.e. with `sendEmailAndWait` or `sendEmailBulk`. The
   * `<template>.html` template renders the HTML body, `<template>.txt` the plain text body (derived from the HTML
   * body when missing), and `<template>.subject` the subject, unless one is given.
   *
   * @param {TemplateEmail} email - The recipient, template name, data and locale of the email.
   * @return {Promise<Email>} A promise that resolves to the rendered email.
   * @throws {TemplateError} `TEMPLATE_NOT_FOUND` if the email has no `.html` or `.txt` template, or no subject,
   * `TEMPLATE_RENDER_FAILED` if a template fails to render.
   */
  public async renderTemplateEmail(email: TemplateEmail): Promise<Email> {
    const { to, template, data = {}, locale, attachments } = email;
    const engine = inject(TemplateEngine);

    const renderIfExists = async (name: string) =>
      (await engine.hasTemplate(name, locale))
        ? engine.render(name, data, { locale })
        : undefined;

    const [html, text, subject] = await Promise.all([
      renderIfExists(`${template}.html`),
      renderIfExists(`${template}.txt`),
      email.subject === undefined
        ? renderIfExists(`${template}.subject`)
        : email.subject
    ]);

    if (html === undefined && text === undefined) {
      throw new TemplateError(
        ErrorCode.TemplateNotFound,
        `Email template '${template}' has no '.html' or '.txt' template`,
        { template: `${template}.html`, locale }
      );
    }
    if (subject === undefined) {
      throw new TemplateError(
        ErrorCode.TemplateNotFound,
        `Email template '${template}' has no '.subject' template`,
        { template: `${template}.subject`, locale }
      );
    }

    return {
      to,
      subject: subject.replace(/\s+/g, ' ').trim(),
      text: text ?? htmlToText(html!),
      html,
      attachments
    };
  }

  /** @internal */
  private async processEmail(job: QueueJob<Email, boolean>): Promise<boolean> {
    try {
      return await this._mailer.sendEmail(job.data);
    } catch (e) {
      throw new MailerError(
        ErrorCode.MailerSendFailed,
        `E-mail '${job.data.subject}' sending failed`,
        { subject: job.data.subject },
        { cause: e }
      );
    }
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
