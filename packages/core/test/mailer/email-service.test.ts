import { ErrorCode, logger, Mailer, Queue } from '@appweaver/common';
import { define } from '../../context';
import { EmailService } from '../../mailer/email-service';
import { resetContext } from '../fixtures/context-fixture';

const email = { to: 'user@test.com', subject: 'Welcome', text: 'Hi' };

describe('email-service', () => {
  let mailer: { sendEmail: jest.Mock };
  let processor: Record<string, jest.Mock>;
  let worker: (job: any) => Promise<boolean>;
  let completed: (job: any) => void;
  let failed: (job: any, error: Error) => void;
  let service: EmailService;

  beforeEach(() => {
    resetContext();
    let jobId = 0;
    mailer = { sendEmail: jest.fn(async () => true) };
    // Captures the handlers the service registers, so a test fires them itself
    processor = {
      addWorker: jest.fn((fn) => (worker = fn)),
      onCompleted: jest.fn((fn) => (completed = fn)),
      onFailed: jest.fn((fn) => (failed = fn)),
      sendJob: jest.fn(async (data) => ({ id: String(++jobId), data })),
      sendBulkJobs: jest.fn()
    };
    define(mailer, Mailer);
    define({ get: () => processor }, Queue);
    jest.spyOn(logger, 'error').mockImplementation();
    service = new EmailService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    resetContext();
  });

  describe('sendEmail', () => {
    test('queues the email', async () => {
      await service.sendEmail(email);

      expect(processor.sendJob).toHaveBeenCalledWith(email);
    });
  });

  describe('sendEmailBulk', () => {
    test('queues every email as a job', async () => {
      await service.sendEmailBulk([email, email]);

      expect(processor.sendBulkJobs).toHaveBeenCalledWith([
        { data: email },
        { data: email }
      ]);
    });
  });

  describe('processing', () => {
    test('sends the queued email with the mailer', async () => {
      expect(await worker({ id: '1', data: email })).toBe(true);
      expect(mailer.sendEmail).toHaveBeenCalledWith(email);
    });

    test('wraps a failed sending in a mailer error', async () => {
      const cause = new Error('SMTP down');
      mailer.sendEmail.mockRejectedValueOnce(cause);

      await expect(worker({ id: '1', data: email })).rejects.toMatchObject({
        code: ErrorCode.MailerSendFailed,
        details: { subject: 'Welcome' },
        cause
      });
    });
  });

  describe('sendEmailAndWait', () => {
    test('resolves once the job of the email completes', async () => {
      const sent = service.sendEmailAndWait(email);
      await new Promise(setImmediate);

      completed({ id: '1', data: email });

      await expect(sent).resolves.toBe(true);
    });

    test('rejects with the error of the failed job', async () => {
      const sent = service.sendEmailAndWait(email);
      await new Promise(setImmediate);

      failed({ id: '1', data: email }, new Error('rejected'));

      await expect(sent).rejects.toThrow('rejected');
    });

    test('rejects a job without an id', async () => {
      processor.sendJob.mockResolvedValueOnce({ data: email });

      await expect(service.sendEmailAndWait(email)).rejects.toMatchObject({
        code: ErrorCode.MailerJobNotFound
      });
    });
  });

  describe('sendEmailBulkAndWait', () => {
    test('reports the result of every email', async () => {
      const sent = service.sendEmailBulkAndWait([email, email]);
      await new Promise(setImmediate);

      const error = new Error('rejected');
      completed({ id: '1', data: email });
      failed({ id: '2', data: email }, error);

      expect(await sent).toEqual([
        { success: true },
        { success: false, error }
      ]);
    });
  });
});
