import {
  ConfigurationError,
  createLogger,
  ErrorCode,
  Queue,
  QueueJob,
  SmsError,
  SmsMessage,
  SmsSender,
  SpanKind,
  telemetryEnabled,
  TemplateEngine,
  TemplateError,
  TemplateSms,
  withSpan
} from '@appweaver/common';
import { inject } from '../context';
import { smsConfig } from './sms-config';

const logger = createLogger('sms');

export class SmsService {
  /** @internal */
  private readonly _smsSender = inject(SmsSender);
  /** @internal */
  private readonly _smsQueue = inject(Queue).get<SmsMessage, boolean>('sms');
  /** @internal */
  private readonly _templateEngine = inject(TemplateEngine, false);
  /** @internal */
  private readonly _waitedJobs = new Map<
    string,
    { resolve: (success: boolean) => void; reject: (error: Error) => void }
  >();

  constructor() {
    this._smsQueue.addWorker(this.processSms.bind(this));
    this._smsQueue.onCompleted(this.onSmsSent.bind(this));
    this._smsQueue.onFailed(this.onSmsError.bind(this));
  }

  /**
   * Sends a text message by adding it to the SMS queue. A template message is rendered first, see
   * {@link renderTemplateSms}. A message without a sender is sent from the `sms.sender` config, or the default sender
   * of the driver.
   *
   * @param {SmsMessage | TemplateSms} sms - The message to send, or the template message to render and send.
   * @return {Promise<void>} A promise that resolves when the message is added to the queue.
   * @throws {TemplateError} See {@link renderTemplateSms}.
   */
  public async sendSms(sms: SmsMessage | TemplateSms): Promise<void> {
    const message = await this.toSms(sms);
    await this._smsQueue.sendJob(message);
    logger.debug(
      { template: 'template' in sms ? sms.template : undefined },
      'SMS queued'
    );
  }

  /**
   * Sends text messages by adding them to the SMS queue at once. A template message that fails to render is logged
   * and left out, the others are still queued.
   *
   * @param {(SmsMessage | TemplateSms)[]} messages - The messages to send, or the template messages to render.
   * @return {Promise<void>} A promise that resolves when the messages are added to the queue.
   */
  public async sendSmsBulk(
    messages: (SmsMessage | TemplateSms)[]
  ): Promise<void> {
    const results = await Promise.allSettled(
      messages.map((sms) => this.toSms(sms))
    );

    const rendered: SmsMessage[] = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        rendered.push(result.value);
      } else {
        const sms = messages[i];
        const name = 'template' in sms ? sms.template : sms.to;
        logger.error(result.reason, `SMS '${name}' could not be queued`);
      }
    });

    if (rendered.length) {
      await this._smsQueue.sendBulkJobs(rendered.map((data) => ({ data })));
      logger.debug({ count: rendered.length }, 'SMS messages queued');
    }
  }

  /**
   * Sends a text message through the SMS queue and waits until it is sent, or failed after the retries of the queue.
   * A template message is rendered first, see {@link renderTemplateSms}.
   *
   * @param {SmsMessage | TemplateSms} sms - The message to send, or the template message to render and send.
   * @return {Promise<boolean>} A promise that resolves with `true` once the message is sent.
   * @throws {SmsError} `SMS_SEND_FAILED` if the provider rejects the message, `SMS_JOB_NOT_FOUND` if the queue returns
   * no job id.
   * @throws {TemplateError} See {@link renderTemplateSms}.
   */
  public async sendSmsAndWait(sms: SmsMessage | TemplateSms): Promise<boolean> {
    const job = await this._smsQueue.sendJob(await this.toSms(sms));

    return new Promise<boolean>((resolve, reject) => {
      if (!job.id) {
        return reject(
          new SmsError(
            ErrorCode.SmsJobNotFound,
            'SMS job not found. The SMS could still be sent.'
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
   * Sends text messages and waits for all of them to finish. A template message that fails to render is reported as a
   * failed result, the others are still sent.
   *
   * @param {(SmsMessage | TemplateSms)[]} messages - The messages to send, or the template messages to render.
   * @return {Promise<{ success: boolean; error?: Error }[]>} The result of every message, in their order.
   */
  public async sendSmsBulkAndWait(
    messages: (SmsMessage | TemplateSms)[]
  ): Promise<{ success: boolean; error?: Error }[]> {
    const results = await Promise.allSettled(
      messages.map((sms) => this.sendSmsAndWait(sms))
    );

    return results.map((result) =>
      result.status === 'fulfilled'
        ? { success: true }
        : { success: false, error: result.reason }
    );
  }

  /**
   * Renders the `<template>.txt` template of a text message into the message to send, which the send methods do for a
   * template message themselves. The text is trimmed, its whitespace collapsed into single spaces.
   *
   * @param {TemplateSms} sms - The recipient, template name, data and locale of the message.
   * @return {Promise<SmsMessage>} A promise that resolves to the rendered message.
   * @throws {ConfigurationError} `CONFIGURATION_INVALID` if no template engine is loaded.
   * @throws {TemplateError} `TEMPLATE_NOT_FOUND` if the message has no `.txt` template, `TEMPLATE_RENDER_FAILED` if it
   * fails to render.
   */
  public async renderTemplateSms(sms: TemplateSms): Promise<SmsMessage> {
    const { template, data = {}, locale, ...message } = sms;
    const engine = this._templateEngine;
    if (!engine) {
      throw new ConfigurationError(
        ErrorCode.ConfigurationInvalid,
        `SMS template '${template}' requires a template engine`
      );
    }

    const name = `${template}.txt`;
    if (!(await engine.hasTemplate(name, locale))) {
      throw new TemplateError(
        ErrorCode.TemplateNotFound,
        `SMS template '${template}' has no '.txt' template`,
        { template: name, locale }
      );
    }

    const text = await engine.render(name, data, { locale });

    return { ...message, text: text.replace(/\s+/g, ' ').trim() };
  }

  /** @internal */
  private async toSms(sms: SmsMessage | TemplateSms): Promise<SmsMessage> {
    const message = 'template' in sms ? await this.renderTemplateSms(sms) : sms;
    const from = message.from ?? smsConfig.SENDER;
    return from ? { ...message, from } : message;
  }

  /** @internal */
  private async processSms(
    job: QueueJob<SmsMessage, boolean>
  ): Promise<boolean> {
    try {
      if (!telemetryEnabled('sms')) {
        return await this._smsSender.sendSms(job.data);
      }
      return await withSpan(
        'sms send',
        {
          kind: SpanKind.CLIENT,
          attributes: {
            'appweaver.sms.provider': this._smsSender.constructor.name
          }
        },
        () => this._smsSender.sendSms(job.data)
      );
    } catch (e) {
      if (e instanceof SmsError) {
        throw e;
      }
      throw new SmsError(
        ErrorCode.SmsSendFailed,
        'SMS sending failed',
        { provider: this._smsSender.constructor.name },
        { cause: e }
      );
    }
  }

  /** @internal */
  private onSmsSent(job: QueueJob<SmsMessage, boolean>): void {
    if (job.id) {
      this._waitedJobs.get(job.id)?.resolve(true);
    }

    logger.debug({ jobId: job.id }, 'SMS sent');
  }

  /** @internal */
  private onSmsError(
    job: QueueJob<SmsMessage, boolean> | undefined,
    error: Error
  ): void {
    if (job?.id) {
      this._waitedJobs.get(job.id)?.reject(error);
    }

    logger.error(error, 'SMS sending failed');
  }
}
