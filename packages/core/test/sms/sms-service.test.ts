import {
  configOverrides,
  createLogger,
  ErrorCode,
  Queue,
  SmsError,
  SmsSender,
  SpanKind,
  TemplateEngine
} from '@appweaver/common';
import { recordTelemetry, TelemetryRecorder } from '@appweaver/testing';
import { define } from '../../context/dependency-injection';
import { SmsService } from '../../sms';
import { resetContext } from '../fixtures/context-fixture';

const logger = createLogger('sms');

describe('sms-service', () => {
  let sender: { sendSms: jest.Mock };
  let processor: Record<string, jest.Mock>;
  let worker: (job: any) => Promise<boolean>;
  let completed: (job: any) => void;
  let failed: (job: any, error: Error) => void;
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
    processor = {
      addWorker: jest.fn((fn) => (worker = fn)),
      onCompleted: jest.fn((fn) => (completed = fn)),
      onFailed: jest.fn((fn) => (failed = fn)),
      sendJob: jest.fn(async (data) => ({ id: String(++jobId), data })),
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

    test('wraps another error of the driver in an SMS error', async () => {
      sender.sendSms.mockRejectedValue(new Error('Socket closed'));

      await expect(
        worker({ data: { to: '+1', text: 'Hi' } })
      ).rejects.toMatchObject({
        code: ErrorCode.SmsSendFailed,
        details: { provider: 'Object' }
      });
    });
  });

  describe('sendSmsAndWait', () => {
    test('resolves once the job of the message completes', async () => {
      const sent = service.sendSmsAndWait({ to: '+1555', text: 'Hi' });
      await new Promise(setImmediate);

      completed({ id: '1', data: {} });

      await expect(sent).resolves.toBe(true);
    });

    test('rejects with the error of the failed job', async () => {
      const sent = service.sendSmsAndWait({ to: '+1555', text: 'Hi' });
      await new Promise(setImmediate);

      failed({ id: '1', data: {} }, new Error('Rejected'));

      await expect(sent).rejects.toThrow('Rejected');
    });

    test('rejects a job without an id', async () => {
      processor.sendJob.mockResolvedValue({ data: {} });

      await expect(
        service.sendSmsAndWait({ to: '+1555', text: 'Hi' })
      ).rejects.toMatchObject({ code: ErrorCode.SmsJobNotFound });
    });

    test('rejects a template message failing to render', async () => {
      engine.hasTemplate.mockResolvedValue(false);

      await expect(
        service.sendSmsAndWait({ to: '+1555', template: 'sms/missing' })
      ).rejects.toMatchObject({ code: ErrorCode.TemplateNotFound });
      expect(processor.sendJob).not.toHaveBeenCalled();
    });

    test('ignores the events of the jobs nobody waits for', () => {
      expect(() => completed({ data: {} })).not.toThrow();
      expect(() => failed(undefined, new Error('Lost'))).not.toThrow();
    });
  });

  describe('sendSmsBulkAndWait', () => {
    test('reports the result of every message', async () => {
      const sent = service.sendSmsBulkAndWait([
        { to: '+1555', text: 'A' },
        { to: '+1556', text: 'B' }
      ]);
      await new Promise(setImmediate);

      completed({ id: '1', data: {} });
      failed({ id: '2', data: {} }, new Error('Rejected'));

      await expect(sent).resolves.toEqual([
        { success: true },
        { success: false, error: new Error('Rejected') }
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
