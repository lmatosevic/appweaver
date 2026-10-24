import {
  ErrorCode,
  logger,
  Mailer,
  Queue,
  TemplateEngine
} from '@appweaver/common';
import { define } from '../../context/dependency-injection';
import { EmailService } from '../../mailer';
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

  describe('renderTemplateEmail', () => {
    let templates: Record<string, string>;
    let engine: { hasTemplate: jest.Mock; render: jest.Mock };

    beforeEach(() => {
      templates = {
        'emails/welcome.html': '<p>Hi <a href="https://app.test">there</a></p>',
        'emails/welcome.txt': 'Hi there',
        'emails/welcome.subject': '  Welcome\n aboard '
      };
      engine = {
        hasTemplate: jest.fn(async (name: string) => name in templates),
        render: jest.fn(async (name: string) => templates[name])
      };
      define(engine, TemplateEngine as any);
      service = new EmailService();
    });

    test('renders the body and subject templates in the locale', async () => {
      const rendered = await service.renderTemplateEmail({
        to: 'user@test.com',
        template: 'emails/welcome',
        data: { name: 'Ana' },
        locale: 'de',
        attachments: [{ filename: 'a.txt', content: 'a' }]
      });

      expect(rendered).toEqual({
        to: 'user@test.com',
        subject: 'Welcome aboard',
        html: templates['emails/welcome.html'],
        text: 'Hi there',
        attachments: [{ filename: 'a.txt', content: 'a' }]
      });
      expect(engine.render).toHaveBeenCalledWith(
        'emails/welcome.html',
        { name: 'Ana' },
        { locale: 'de' }
      );
      expect(engine.hasTemplate).toHaveBeenCalledWith(
        'emails/welcome.txt',
        'de'
      );
    });

    test('derives the text body from the HTML body', async () => {
      delete templates['emails/welcome.txt'];

      const rendered = await service.renderTemplateEmail({
        to: 'user@test.com',
        template: 'emails/welcome'
      });

      expect(rendered.text).toBe('Hi there (https://app.test)');
    });

    test('sends a text email without the HTML template', async () => {
      delete templates['emails/welcome.html'];

      const rendered = await service.renderTemplateEmail({
        to: 'user@test.com',
        template: 'emails/welcome'
      });

      expect(rendered.html).toBeUndefined();
      expect(rendered.text).toBe('Hi there');
    });

    test('uses the given subject over the subject template', async () => {
      const rendered = await service.renderTemplateEmail({
        to: 'user@test.com',
        template: 'emails/welcome',
        subject: 'Custom'
      });

      expect(rendered.subject).toBe('Custom');
      expect(engine.hasTemplate).not.toHaveBeenCalledWith(
        'emails/welcome.subject',
        undefined
      );
    });

    test('rejects an email without a body template', async () => {
      await expect(
        service.renderTemplateEmail({ to: 'a@test.com', template: 'emails/x' })
      ).rejects.toMatchObject({
        code: ErrorCode.TemplateNotFound,
        details: { template: 'emails/x.html' }
      });
    });

    test('rejects an email without a subject', async () => {
      delete templates['emails/welcome.subject'];

      await expect(
        service.renderTemplateEmail({
          to: 'a@test.com',
          template: 'emails/welcome'
        })
      ).rejects.toMatchObject({
        code: ErrorCode.TemplateNotFound,
        details: { template: 'emails/welcome.subject' }
      });
    });
  });

  describe('without a template engine', () => {
    test('rejects a template email', async () => {
      await expect(
        service.sendEmail({ to: 'user@test.com', template: 'emails/welcome' })
      ).rejects.toMatchObject({ code: ErrorCode.ConfigurationInvalid });
      expect(processor.sendJob).not.toHaveBeenCalled();
    });

    test('sends a plain email', async () => {
      await service.sendEmail(email);

      expect(processor.sendJob).toHaveBeenCalledWith(email);
    });
  });

  describe('with template emails', () => {
    const rendered = {
      to: 'user@test.com',
      subject: 'Welcome',
      text: 'Hi',
      html: undefined,
      attachments: undefined
    };
    const templateEmail = { to: 'user@test.com', template: 'emails/welcome' };

    beforeEach(() => {
      define(
        {
          hasTemplate: async (name: string) =>
            name.startsWith('emails/welcome') && !name.endsWith('.html'),
          render: async (name: string) =>
            name.endsWith('.subject') ? 'Welcome' : 'Hi'
        },
        TemplateEngine as any
      );
      service = new EmailService();
    });

    test('sendEmail queues the rendered email', async () => {
      await service.sendEmail(templateEmail);

      expect(processor.sendJob).toHaveBeenCalledWith(rendered);
    });

    test('sendEmailBulk renders the template emails beside the plain ones', async () => {
      await service.sendEmailBulk([templateEmail, email]);

      expect(processor.sendBulkJobs).toHaveBeenCalledWith([
        { data: rendered },
        { data: email }
      ]);
    });

    test('sendEmailBulk logs an email failing to render and queues the others', async () => {
      await service.sendEmailBulk([
        email,
        { to: 'user@test.com', template: 'emails/missing' },
        templateEmail
      ]);

      expect(processor.sendBulkJobs).toHaveBeenCalledWith([
        { data: email },
        { data: rendered }
      ]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ code: ErrorCode.TemplateNotFound }),
        "E-mail 'emails/missing' rendering failed"
      );
    });

    test('sendEmailBulk queues nothing when no email renders', async () => {
      await service.sendEmailBulk([
        { to: 'user@test.com', template: 'emails/missing' }
      ]);

      expect(processor.sendBulkJobs).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    test('sendEmailAndWait waits for the rendered email', async () => {
      const sent = service.sendEmailAndWait(templateEmail);
      await new Promise(setImmediate);

      expect(processor.sendJob).toHaveBeenCalledWith(rendered);
      completed({ id: '1', data: rendered });
      await expect(sent).resolves.toBe(true);
    });

    test('sendEmailBulkAndWait reports an email failing to render', async () => {
      const sent = service.sendEmailBulkAndWait([
        templateEmail,
        { to: 'user@test.com', template: 'emails/missing' }
      ]);
      await new Promise(setImmediate);

      completed({ id: '1', data: rendered });

      expect(await sent).toEqual([
        { success: true },
        {
          success: false,
          error: expect.objectContaining({ code: ErrorCode.TemplateNotFound })
        }
      ]);
    });
  });
});
