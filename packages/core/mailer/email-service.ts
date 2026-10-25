import {
  ConfigurationError,
  Email,
  ErrorCode,
  createLogger,
  LIFECYCLE,
  Mailer,
  OnInit,
  Queue,
  QueueJob,
  TemplateEmail,
  TemplateEngine,
  MailerError,
  TemplateError
} from '@appweaver/common';
import { inject } from '../context';
import { mailerConfig } from './mailer-config';
import { formatSender } from './utils/email-util';
import { htmlToText } from './utils/html-util';

const logger = createLogger('mailer');

export class EmailService implements OnInit {
  static [LIFECYCLE] = true;

  /** @internal */
  private readonly _mailer = inject(Mailer);
  /** @internal */
  private readonly _mailQueue = inject(Queue).get<Email, boolean>('email');
  /** @internal */
  private readonly _templateEngine = inject(TemplateEngine, false);
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
   * Checks the default sender address, which the account emails are sent from.
   *
   * @throws {ConfigurationError} `CONFIGURATION_INVALID` if the `mailer.senderAddress` config is not set.
   */
  public async onInit(): Promise<void> {
    if (!mailerConfig.SENDER_ADDRESS) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        'The mailer needs a default sender address, set the `mailer.senderAddress` config (MAILER_SENDER_ADDRESS) or disable the mailer with MAILER_PROVIDER=none'
      );
    }
  }

  /**
   * Sends an email by adding it to the mail queue for processing. A template email is rendered first, see
   * {@link renderTemplateEmail}.
   *
   * @param {Email | TemplateEmail} email - The email to send, or the template email to render and send.
   * @return A promise that resolves when the email is successfully added to the queue.
   * @throws {TemplateError} See {@link renderTemplateEmail}.
   * @throws {MailerError} `MAILER_SENDER_MISSING` if neither the email nor the config has a sender address.
   */
  public async sendEmail(email: Email | TemplateEmail): Promise<void> {
    await this._mailQueue.sendJob(await this.toEmail(email));
  }

  /**
   * Sends bulk emails by queuing them for asynchronous processing. The template emails are rendered first, one that
   * fails to render or has no sender is logged and left out, the others are still queued.
   *
   * @param {(Email | TemplateEmail)[]} emails - The emails to send, or the template emails to render and send.
   * @return {Promise<void>} A promise that resolves when the bulk email jobs are successfully queued.
   */
  public async sendEmailBulk(emails: (Email | TemplateEmail)[]): Promise<void> {
    const results = await Promise.allSettled(
      emails.map((email) => this.toEmail(email))
    );

    const rendered: Email[] = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        rendered.push(result.value);
      } else {
        const email = emails[i];
        const name = 'template' in email ? email.template : email.subject;
        logger.error(result.reason, `E-mail '${name}' could not be queued`);
      }
    });

    if (rendered.length) {
      await this._mailQueue.sendBulkJobs(rendered.map((e) => ({ data: e })));
    }
  }

  /**
   * Sends bulk emails and waits for all of them to finish. A template email that fails to render is reported as a
   * failed result, the others are still sent.
   *
   * @param {(Email | TemplateEmail)[]} emails - The emails to send, or the template emails to render and send.
   * @return {Promise<{ success: boolean; error?: Error }[]>} A promise that resolves with an array of results, each
   * containing `success` and an optional `error`.
   */
  public async sendEmailBulkAndWait(
    emails: (Email | TemplateEmail)[]
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
   * Sends an email and waits for the sending process to finish. A template email is rendered first, see
   * {@link renderTemplateEmail}.
   *
   * @param {Email | TemplateEmail} email - The email to send, or the template email to render and send.
   * @return A promise that resolves with `true` when the email is sent successfully, or rejects if sending fails.
   * @throws {TemplateError} See {@link renderTemplateEmail}.
   * @throws {MailerError} `MAILER_SENDER_MISSING` if neither the email nor the config has a sender address.
   */
  public async sendEmailAndWait(
    email: Email | TemplateEmail
  ): Promise<boolean> {
    const job = await this._mailQueue.sendJob(await this.toEmail(email));

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
   * Renders the templates of an email into the email to send, which the send methods do for a template email
   * themselves. The `<template>.html` template renders the HTML body, `<template>.txt` the plain text body (derived
   * from the HTML body when missing), and `<template>.subject` the subject, unless one is given.
   *
   * @param {TemplateEmail} email - The recipient, template name, data and locale of the email.
   * @return {Promise<Email>} A promise that resolves to the rendered email.
   * @throws {ConfigurationError} `CONFIGURATION_INVALID` if no template engine is loaded.
   * @throws {TemplateError} `TEMPLATE_NOT_FOUND` if the email has no `.html` or `.txt` template, or no subject,
   * `TEMPLATE_RENDER_FAILED` if a template fails to render.
   */
  public async renderTemplateEmail(email: TemplateEmail): Promise<Email> {
    const { template, data = {}, locale, ...envelope } = email;
    const engine = this._templateEngine;
    if (!engine) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `Email template '${template}' requires a template engine`
      );
    }

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
      ...envelope,
      subject: subject.replace(/\s+/g, ' ').trim(),
      text: text ?? htmlToText(html!),
      html
    };
  }

  /** @internal */
  private async toEmail(email: Email | TemplateEmail): Promise<Email> {
    const rendered =
      'template' in email ? await this.renderTemplateEmail(email) : email;
    return { ...rendered, from: formatSender(rendered.from) };
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
