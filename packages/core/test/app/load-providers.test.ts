import { resetContext } from '../fixtures/context-fixture';

/** Loads the providers with the given environment, without instantiating them. */
async function loadWithEnv(env: Record<string, string>): Promise<string[]> {
  Object.assign(process.env, env);
  jest.resetModules();

  const { logger } = await import('@appweaver/common');
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

  const { loadProviders } = await import('../../app/load-providers');
  const freshContext = (await import('../../context/context')).context;
  loadProviders(__dirname);

  return freshContext.definitions.map((def) => String(def.name));
}

describe('load-providers', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
    jest.restoreAllMocks();
    jest.resetModules();
  });

  afterAll(() => {
    resetContext();
  });

  describe('loadProviders', () => {
    test('loads the scheduler, the mailer and the email service', async () => {
      const names = await loadWithEnv({});

      expect(names).toEqual(
        expect.arrayContaining(['Scheduler', 'Mailer', 'EmailService'])
      );
    });

    test('skips the scheduler when it is disabled', async () => {
      const names = await loadWithEnv({ SCHEDULER_ENABLED: 'false' });

      expect(names).not.toContain('Scheduler');
    });

    test('skips the mailer and the email service when disabled', async () => {
      const names = await loadWithEnv({ MAILER_ENABLED: 'false' });

      expect(names).not.toContain('Mailer');
      expect(names).not.toContain('EmailService');
    });

    test('skips the email service without a queue', async () => {
      const names = await loadWithEnv({
        QUEUE_PROVIDER: '@appweaver/core/queue/missing'
      });

      expect(names).not.toContain('Queue');
      expect(names).not.toContain('EmailService');
      expect(names).toContain('Mailer');
    });
  });
});
