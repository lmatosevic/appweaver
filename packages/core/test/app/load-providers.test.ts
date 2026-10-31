import {
  AbstractCtor,
  Cache,
  configOverrides,
  defineModule,
  ErrorCode,
  Mailer,
  Memory,
  Queue,
  QueueHistory,
  Scheduler,
  SecurityStore,
  Storage,
  createLogger
} from '@appweaver/common';
import { context } from '../../context/context';
import { define, inject, isDefined } from '../../context/dependency-injection';
import { MemoryQueue } from '../../queue/memory-queue';
import { EnabledModule } from '../../app/discover-modules';
import { loadProviders, selectedProvider } from '../../app/load-providers';
import coreModule from '../../modules/core';
import { resetContext } from '../fixtures/context-fixture';

const load = () => import('../../memory/in-memory');

/** A driver module, standing in for a first-party driver package. */
const driverModule = (
  name: string,
  contract: AbstractCtor,
  provider: string
): EnabledModule => ({
  module: defineModule({
    name,
    providers: [{ contract, name: provider, load }]
  }),
  source: 'package'
});

/** A module standing in for @appweaver/data, with its fallback security store. */
const dataModule: EnabledModule = {
  module: defineModule({
    name: '@appweaver/data',
    providers: [
      { contract: SecurityStore, name: 'database', load, auto: 'fallback' }
    ]
  }),
  source: 'package'
};

/** The modules of core and data, without any driver module. */
const coreModules: EnabledModule[] = [
  { module: coreModule, source: 'core' },
  dataModule
];

const allModules: EnabledModule[] = [
  ...coreModules,
  driverModule('@appweaver/redis', Memory, 'redis'),
  driverModule('@appweaver/bullmq', Queue, 'bullmq'),
  driverModule('@appweaver/cron', Scheduler, 'cron'),
  driverModule('@appweaver/nodemailer', Mailer, 'smtp')
];

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
        expect.arrayContaining(['EmailService', 'LocaleService'])
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

    test('keeps a definition the application made before', async () => {
      const memory = { name: 'stub' };
      define(memory, Memory);

      await loadProviders(allModules, __dirname);

      expect(inject(Memory)).toBe(memory);
    });

    test('lets the application replace a provider and a service', async () => {
      await loadProviders(allModules, __dirname);
      const memory = { name: 'stub' };
      const locale = { name: 'locale' };

      define(memory, Memory);
      define(locale, 'LocaleService');

      expect(inject(Memory)).toBe(memory);
      expect(inject('LocaleService')).toBe(locale);
    });

    test('selects the driver of a copy of the contract with the same name', async () => {
      // The Memory of another copy of @appweaver/common
      const CopiedMemory = { name: 'Memory' } as unknown as typeof Memory;

      await loadProviders(
        [...coreModules, driverModule('copied-redis', CopiedMemory, 'redis')],
        __dirname
      );

      expect(selectedProvider(Memory)).toBe('redis');
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
  describe('decorators', () => {
    const historyModule: EnabledModule = {
      module: defineModule({
        name: '@appweaver/data',
        providers: [
          {
            contract: QueueHistory,
            name: 'database',
            load: async () => ({ StubHistory: class StubHistory {} })
          }
        ]
      }),
      source: 'package'
    };

    test('wraps the queue with the history once it is enabled', async () => {
      configOverrides.QUEUE_HISTORY_ENABLED = true;

      await loadProviders(
        [{ module: coreModule, source: 'core' }, historyModule],
        __dirname
      );

      expect(selectedProvider(QueueHistory)).toBe('database');
      expect(context.decorators.get('Queue')).toHaveLength(1);
      expect(definedNames()).toContain('QueueHistoryCleaner');
      expect(inject(Queue)).toBeInstanceOf(MemoryQueue);
    });

    test('leaves the queue and the history out while it is disabled', async () => {
      await loadProviders(
        [{ module: coreModule, source: 'core' }, historyModule],
        __dirname
      );

      expect(isDefined(QueueHistory)).toBe(false);
      expect(context.decorators.has('Queue')).toBe(false);
      expect(definedNames()).not.toContain('QueueHistoryCleaner');
    });

    test('warns of an enabled history without a provider', async () => {
      configOverrides.QUEUE_HISTORY_ENABLED = true;
      const warn = jest
        .spyOn(createLogger('app'), 'warn')
        .mockImplementation(() => undefined);

      await loadProviders(coreModules, __dirname);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('queue history is enabled')
      );
      warn.mockRestore();
    });
  });
});
