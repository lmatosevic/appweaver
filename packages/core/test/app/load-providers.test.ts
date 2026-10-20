import {
  Cache,
  configOverrides,
  defineModule,
  ErrorCode,
  Mailer,
  Memory,
  Queue,
  Scheduler,
  SecurityStore,
  Storage
} from '@appweaver/common';
import { context, isDefined } from '../../context';
import { EnabledModule } from '../../app/discover-modules';
import { loadProviders, selectedProvider } from '../../app/load-providers';
import { firstPartyModules } from '../../modules';
import { resetContext } from '../fixtures/context-fixture';

const allModules: EnabledModule[] = firstPartyModules.map(({ module }) => ({
  module,
  source: 'core'
}));

/** The modules of core and data, without any driver module. */
const coreModules = allModules.filter(({ module }) =>
  ['@appweaver/core', '@appweaver/data'].includes(module.name)
);

const definedNames = () => context.definitions.map((def) => String(def.name));

describe('load-providers', () => {
  beforeEach(() => {
    resetContext();
  });

  afterEach(() => {
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  afterAll(() => {
    resetContext();
  });

  describe('loadProviders', () => {
    test('selects the drivers of the enabled modules for auto', async () => {
      await loadProviders(allModules, __dirname);

      expect(selectedProvider(Memory)).toBe('redis');
      expect(selectedProvider(Queue)).toBe('bullmq');
      expect(selectedProvider(Scheduler)).toBe('cron');
      expect(selectedProvider(Mailer)).toBe('smtp');
      expect(selectedProvider(SecurityStore)).toBe('database');
      expect(definedNames()).toEqual(
        expect.arrayContaining(['EmailService', 'LocaleService', 'HttpServer'])
      );
    });

    test('falls back to the drivers of core without driver modules', async () => {
      await loadProviders(coreModules, __dirname);

      expect(selectedProvider(Memory)).toBe('memory');
      expect(selectedProvider(Cache)).toBe('memory');
      expect(selectedProvider(Queue)).toBe('memory');
      expect(selectedProvider(Storage)).toBe('local');
      expect(selectedProvider(Scheduler)).toBeUndefined();
      expect(isDefined(Scheduler)).toBe(false);
    });

    test('leaves the mailer and the email service out without a driver', async () => {
      await loadProviders(coreModules, __dirname);

      expect(isDefined(Mailer)).toBe(false);
      expect(definedNames()).not.toContain('EmailService');
    });

    test('selects a provider by its name', async () => {
      configOverrides.MAILER_PROVIDER = 'json';

      await loadProviders(coreModules, __dirname);

      expect(selectedProvider(Mailer)).toBe('json');
      expect(definedNames()).toContain('EmailService');
    });

    test('disables a contract and the services requiring it with none', async () => {
      configOverrides.QUEUE_PROVIDER = 'none';

      await loadProviders(allModules, __dirname);

      expect(isDefined(Queue)).toBe(false);
      expect(definedNames()).not.toContain('EmailService');
    });

    test('loads a provider from a module path', async () => {
      configOverrides.MEMORY_PROVIDER = '../../memory/in-memory';

      await loadProviders(allModules, __dirname);

      expect(selectedProvider(Memory)).toBe('../../memory/in-memory');
      expect(isDefined(Memory)).toBe(true);
    });

    test('fails for a provider no enabled module registers', async () => {
      configOverrides.SCHEDULER_PROVIDER = 'agenda';

      await expect(loadProviders(coreModules, __dirname)).rejects.toMatchObject(
        { code: ErrorCode.ModuleProviderMissing }
      );
    });

    test('fails for auto matching the drivers of two modules', async () => {
      const otherRedis = defineModule({
        name: 'other-redis',
        providers: [
          {
            contract: Memory,
            name: 'valkey',
            load: () => import('../../memory/in-memory')
          }
        ]
      });

      await expect(
        loadProviders(
          [...allModules, { module: otherRedis, source: 'local' }],
          __dirname
        )
      ).rejects.toMatchObject({
        code: ErrorCode.ModuleProviderAmbiguous,
        details: { contract: 'Memory', providers: ['redis', 'valkey'] }
      });
    });
  });
});
