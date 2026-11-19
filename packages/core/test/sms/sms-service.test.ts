import {
  configOverrides,
  createLogger,
  ErrorCode,
  PubSub,
  Queue,
  SmsError,
  SmsSender,
  SpanKind,
  TemplateEngine
} from '@appweaver/common';
import { recordTelemetry, TelemetryRecorder } from '@appweaver/testing';
import { context } from '../../context';
import { MemoryPubSub } from '../../pubsub/memory-pubsub';
import { define } from '../../context/dependency-injection';
import { SmsService } from '../../sms';
import { resetContext } from '../fixtures/context-fixture';

const logger = createLogger('sms');

describe('sms-service', () => {
  let sender: { sendSms: jest.Mock };
  let processor: Record<string, jest.Mock>;
  let worker: (job: any) => Promise<boolean>;
  let completed: (job: any) => Promise<void>;
  let failed: (job: any, error: Error) => Promise<void>;
  let engine: { hasTemplate: jest.Mock; render: jest.Mock };
  let service: SmsService;

  /** Creates the service, with a template engine unless told otherwise. */
  function createService(withTemplates: boolean = true): SmsService {
    resetContext();
    define(sender, SmsSender);
    define({ get: () => processor }, Queue);
    if (withTemplates) {
      define(engine, TemplateEngine as any);
    }
    return new SmsService();
  }

  beforeEach(() => {
    let jobId = 0;
    sender = { sendSms: jest.fn(async () => true) };
    // Captures the handlers the service registers, so a test fires them itself
    const onCompleted: ((...args: any[]) => unknown)[] = [];
    const onFailed: ((...args: any[]) => unknown)[] = [];
    completed = async (job) => {
      await Promise.all(onCompleted.map((fn) => fn(job, true)));
    };
    failed = async (job, error) => {
      await Promise.all(onFailed.map((fn) => fn(job, error)));
    };
    processor = {
      addWorker: jest.fn((fn) => (worker = fn)),
      onCompleted: jest.fn((fn) => onCompleted.push(fn)),
      onFailed: jest.fn((fn) => onFailed.push(fn)),
      willRetry: jest.fn(() => false),
      sendJob: jest.fn(async (data, _name, options) => ({
        id: options?.jobId ?? String(++jobId),
        data
      })),
      sendBulkJobs: jest.fn()
    };
    engine = {
      hasTemplate: jest.fn(async () => true),
      render: jest.fn(async (_name, data) => `  Your code\n is ${data.code}  `)
    };
    jest.spyOn(logger, 'error').mockImplementation();
    service = createService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete configOverrides.SMS_SENDER;
  });

  afterAll(() => {
    resetContext();
  });

  describe('sendSms', () => {
    test('queues the message', async () => {
      await service.sendSms({ to: '+1555', text: 'Hi', from: 'Shop' });

      expect(processor.sendJob).toHaveBeenCalledWith({
        to: '+1555',
        text: 'Hi',
        from: 'Shop'
      });
      expect(sender.sendSms).not.toHaveBeenCalled();
    });

    test('queues the message from the configured sender', async () => {
      configOverrides.SMS_SENDER = 'Default';

      await service.sendSms({ to: '+1555', text: 'Hi' });

      expect(processor.sendJob).toHaveBeenCalledWith({
        to: '+1555',
        text: 'Hi',
        from: 'Default'
      });
    });

    test('leaves the sender to the driver without a configured one', async () => {
      await service.sendSms({ to: '+1555', text: 'Hi' });

      expect(processor.sendJob).toHaveBeenCalledWith({
        to: '+1555',
        text: 'Hi'
      });
    });

    test('queues the rendered template message', async () => {
      await service.sendSms({
        to: '+1555',
        template: 'sms/code',
        data: { code: '123456' }
      });

      expect(processor.sendJob).toHaveBeenCalledWith({
        to: '+1555',
        text: 'Your code is 123456'
      });
    });
  });

  describe('sendSmsBulk', () => {
    test('queues every message as a job', async () => {
      await service.sendSmsBulk([
        { to: '+1555', text: 'A' },
        { to: '+1556', template: 'sms/code', data: { code: '1' } }
      ]);

      expect(processor.sendBulkJobs).toHaveBeenCalledWith([
        { data: { to: '+1555', text: 'A' } },
        { data: { to: '+1556', text: 'Your code is 1' } }
      ]);
    });

    test('logs a message failing to render and queues the others', async () => {
      engine.hasTemplate.mockImplementation(
        async (name: string) => name !== 'sms/missing.txt'
      );

      await service.sendSmsBulk([
        { to: '+1555', template: 'sms/missing' },
        { to: '+1556', text: 'B' }
      ]);

      expect(processor.sendBulkJobs).toHaveBeenCalledWith([
        { data: { to: '+1556', text: 'B' } }
      ]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ code: ErrorCode.TemplateNotFound }),
        "SMS 'sms/missing' could not be queued"
      );
    });

    test('logs a plain message failing to queue by its recipient', async () => {
      configOverrides.SMS_SENDER = 'Default';
      const toSms = jest
        .spyOn(service as any, 'toSms')
        .mockRejectedValueOnce(new Error('Broken'));

      await service.sendSmsBulk([{ to: '+1555', text: 'A' }]);

      expect(toSms).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        expect.any(Error),
        "SMS '+1555' could not be queued"
      );
    });

    test('queues nothing when no message renders', async () => {
      engine.hasTemplate.mockResolvedValue(false);

      await service.sendSmsBulk([{ to: '+1555', template: 'sms/missing' }]);

      expect(processor.sendBulkJobs).not.toHaveBeenCalled();
    });
  });

  describe('processing', () => {
    test('sends the queued message with the driver', async () => {
      await expect(worker({ data: { to: '+1555', text: 'Hi' } })).resolves.toBe(
        true
      );
      expect(sender.sendSms).toHaveBeenCalledWith({ to: '+1555', text: 'Hi' });
    });

    test('keeps the error of the driver', async () => {
      const error = new SmsError(ErrorCode.SmsSendFailed, 'Rejected', {
        provider: 'twilio',
        status: 400
      });
      sender.sendSms.mockRejectedValue(error);

      await expect(worker({ data: { to: '+1', text: 'Hi' } })).rejects.toBe(
        error
      );
    });

    test('keeps the SMS error of a driver with its own copy of the errors', async () => {
      const error = Object.assign(new Error('Rejected'), {
        code: ErrorCode.SmsSendFailed,
        module: 'sms',
        details: { provider: 'vonage', status: 400 }
      });
      sender.sendSms.mockRejectedValue(error);

      await expect(worker({ data: { to: '+1', text: 'Hi' } })).rejects.toBe(
        error
      );
    });

    test('wraps another error of the driver in an SMS error', async () => {
      sender.sendSms.mockRejectedValue(new Error('Socket closed'));

      await expect(
        worker({ data: { to: '+1', text: 'Hi' } })
      ).rejects.toMatchObject({
        code: ErrorCode.SmsSendFailed,
        details: { provider: 'Object' }
      });
    });

    test('names the selected provider in the error', async () => {
      context.modules.providers.set(SmsSender.name, 'twilio');
      sender.sendSms.mockRejectedValue(new Error('Socket closed'));

      await expect(
        worker({ data: { to: '+1', text: 'Hi' } })
      ).rejects.toMatchObject({ details: { provider: 'twilio' } });
    });
  });

  describe('sendSmsAndWait', () => {
    /** The ID the service sent the job of the given call with. */
    const jobIdOf = (call = 0) => processor.sendJob.mock.calls[call][2].jobId;

    test('resolves once the job of the message completes', async () => {
      const sent = service.sendSmsAndWait({ to: '+1555', text: 'Hi' });
      await new Promise(setImmediate);

      await completed({ id: jobIdOf(), data: {} });

      await expect(sent).resolves.toBe(true);
    });

    test('rejects with the error of the failed job', async () => {
      const sent = service.sendSmsAndWait({ to: '+1555', text: 'Hi' });
      await new Promise(setImmediate);

      await failed({ id: jobIdOf(), data: {} }, new Error('Rejected'));

      await expect(sent).rejects.toMatchObject({
        code: ErrorCode.SmsSendFailed,
        message: 'Rejected'
      });
    });

    test('keeps the code and the details of an SMS error', async () => {
      const sent = service.sendSmsAndWait({ to: '+1555', text: 'Hi' });
      await new Promise(setImmediate);

      await failed(
        { id: jobIdOf(), data: {} },
        new SmsError(ErrorCode.SmsSendFailed, 'Blocked', {
          provider: 'twilio',
          status: 400
        })
      );

      await expect(sent).rejects.toMatchObject({
        code: ErrorCode.SmsSendFailed,
        details: { provider: 'twilio', status: 400 }
      });
    });

    test('waits for the last attempt of a retried job', async () => {
      processor.willRetry.mockReturnValueOnce(true);
      const sent = service.sendSmsAndWait({ to: '+1555', text: 'Hi' });
      await new Promise(setImmediate);

      await failed({ id: jobIdOf(), data: {} }, new Error('Busy'));
      await completed({ id: jobIdOf(), data: {} });

      await expect(sent).resolves.toBe(true);
    });

    test('rejects when the job cannot be queued', async () => {
      processor.sendJob.mockRejectedValueOnce(new Error('Queue closed'));

      await expect(
        service.sendSmsAndWait({ to: '+1555', text: 'Hi' })
      ).rejects.toThrow('Queue closed');
    });

    test('receives the result from the worker of another instance', async () => {
      resetContext();
      define(sender, SmsSender);
      define({ get: () => processor }, Queue);
      define(new MemoryPubSub(), PubSub);
      // The worker of the other instance completes the job the first one waits for
      const waiting = new SmsService();
      const sent = waiting.sendSmsAndWait({ to: '+1555', text: 'Hi' });
      await new Promise(setImmediate);

      await completed({ id: jobIdOf(), data: {} });

      await expect(sent).resolves.toBe(true);
    });

    test('rejects a template message failing to render', async () => {
      engine.hasTemplate.mockResolvedValue(false);

      await expect(
        service.sendSmsAndWait({ to: '+1555', template: 'sms/missing' })
      ).rejects.toMatchObject({ code: ErrorCode.TemplateNotFound });
      expect(processor.sendJob).not.toHaveBeenCalled();
    });

    test('ignores the events of the jobs nobody waits for', async () => {
      await expect(completed({ data: {} })).resolves.toBeUndefined();
      await expect(
        failed({ id: 'waited-gone', data: {} }, new Error('Lost'))
      ).resolves.toBeUndefined();
      await expect(
        failed(undefined, new Error('Lost'))
      ).resolves.toBeUndefined();
    });
  });

  describe('sendSmsBulkAndWait', () => {
    test('reports the result of every message', async () => {
      const sent = service.sendSmsBulkAndWait([
        { to: '+1555', text: 'A' },
        { to: '+1556', text: 'B' }
      ]);
      await new Promise(setImmediate);

      const [first, second] = processor.sendJob.mock.calls;
      await completed({ id: first[2].jobId, data: {} });
      await failed({ id: second[2].jobId, data: {} }, new Error('Rejected'));

      await expect(sent).resolves.toEqual([
        { success: true },
        {
          success: false,
          error: expect.objectContaining({ message: 'Rejected' })
        }
      ]);
    });
  });

  describe('renderTemplateSms', () => {
    test('renders the text template in the locale', async () => {
      await expect(
        service.renderTemplateSms({
          to: '+1555',
          template: 'sms/code',
          data: { code: '42' },
          locale: 'de',
          from: 'Shop'
        })
      ).resolves.toEqual({
        to: '+1555',
        text: 'Your code is 42',
        from: 'Shop'
      });

      expect(engine.hasTemplate).toHaveBeenCalledWith('sms/code.txt', 'de');
      expect(engine.render).toHaveBeenCalledWith(
        'sms/code.txt',
        { code: '42' },
        { locale: 'de' }
      );
    });

    test('renders without data', async () => {
      await service.renderTemplateSms({ to: '+1555', template: 'sms/code' });

      expect(engine.render).toHaveBeenCalledWith(
        'sms/code.txt',
        {},
        { locale: undefined }
      );
    });

    test('rejects a message without a text template', async () => {
      engine.hasTemplate.mockResolvedValue(false);

      await expect(
        service.renderTemplateSms({ to: '+1555', template: 'sms/missing' })
      ).rejects.toMatchObject({
        code: ErrorCode.TemplateNotFound,
        details: { template: 'sms/missing.txt' }
      });
    });

    test('requires a template engine', async () => {
      await expect(
        createService(false).renderTemplateSms({
          to: '+1555',
          template: 'sms/code'
        })
      ).rejects.toMatchObject({ code: ErrorCode.ConfigurationInvalid });
    });
  });

  describe('telemetry', () => {
    let telemetry: TelemetryRecorder;
    const sms = { to: '+385911234567', text: 'Hello' };

    beforeEach(() => {
      telemetry = recordTelemetry();
    });

    afterEach(async () => {
      await telemetry.stop();
      delete configOverrides.TELEMETRY_INSTRUMENTATIONS_SMS;
    });

    test('sends a message in a client span', async () => {
      expect(await worker({ id: '1', data: sms })).toBe(true);

      const span = telemetry.span('sms send');
      expect(span.kind).toBe(SpanKind.CLIENT);
      expect(span.attributes).toEqual({ 'appweaver.sms.provider': 'Object' });
    });

    test('sends without a span with the instrumentation off', async () => {
      configOverrides.TELEMETRY_INSTRUMENTATIONS_SMS = false;

      expect(await worker({ id: '1', data: sms })).toBe(true);
      expect(telemetry.spans()).toHaveLength(0);
    });
  });
});
