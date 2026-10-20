import {
  AbstractCtor,
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
import { context } from '../../context/context';
import { isDefined } from '../../context/dependency-injection';
import { EnabledModule } from '../../app/discover-modules';
import { loadProviders, selectedProvider } from '../../app/load-providers';
import { firstPartyModules } from '../../modules';
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
  ...firstPartyModules.map(({ module }) => ({
    module,
    source: 'core' as const
  })),
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
