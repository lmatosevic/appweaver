import { HEALTH_CHECK, HealthCheckStatus } from '@appweaver/common';
import { define } from '../../context';
import { HealthService } from '../../health/health-service';
import { resetContext } from '../fixtures/context-fixture';

/** Creates a health check instance the way the framework detects them. */
function healthCheck(
  name: string,
  result: { success: boolean; message?: string },
  checkConfig?: { name?: string; showMessage?: boolean }
) {
  const instance = {
    [HEALTH_CHECK]: true,
    checkHealth: jest.fn().mockResolvedValue(result),
    checkHealthConfig: checkConfig ? () => checkConfig : undefined
  };

  // The instance name is derived from its constructor when not configured
  Object.defineProperty(instance.constructor, 'name', { value: name });

  return instance;
}

describe('health-service', () => {
  let service: HealthService;

  beforeEach(() => {
    resetContext();
    service = new HealthService();
  });

  afterAll(() => {
    resetContext();
  });

  describe('healthCheckInstances', () => {
    test('returns the registered health check instances', () => {
      define(
        healthCheck('Database', { success: true }, { name: 'database' }),
        'Database'
      );

      const instances = service.healthCheckInstances();

      expect(instances).toHaveLength(1);
      expect(instances[0].name).toBe('database');
    });

    test('ignores definitions that are not health checks', () => {
      define({ value: 'config' }, 'Config');

      expect(service.healthCheckInstances()).toHaveLength(0);
    });

    test('deduplicates instances registered under the same name', () => {
      const instance = healthCheck(
        'Cache',
        { success: true },
        { name: 'cache' }
      );
      define(instance, 'Cache', 'append');
      define(instance, 'CacheAlias', 'append');

      expect(service.healthCheckInstances()).toHaveLength(1);
    });

    test('exposes the health check configuration', () => {
      define(
        healthCheck(
          'Mailer',
          { success: true },
          { name: 'mailer', showMessage: false }
        ),
        'Mailer'
      );

      expect(service.healthCheckInstances()[0].config).toEqual({
        name: 'mailer',
        showMessage: false
      });
    });
  });

  describe('checkHealth', () => {
    test('reports an up status for a successful check', async () => {
      define(
        healthCheck('Database', { success: true }, { name: 'database' }),
        'Database'
      );

      await expect(service.checkHealth()).resolves.toEqual({
        database: { status: HealthCheckStatus.Up, message: undefined }
      });
    });

    test('reports a down status with the failure message', async () => {
      define(
        healthCheck(
          'Database',
          { success: false, message: 'connection refused' },
          { name: 'database' }
        ),
        'Database'
      );

      await expect(service.checkHealth()).resolves.toEqual({
        database: {
          status: HealthCheckStatus.Down,
          message: 'connection refused'
        }
      });
    });

    test('checks every registered instance', async () => {
      const database = healthCheck(
        'Database',
        { success: true },
        { name: 'database' }
      );
      const cache = healthCheck('Cache', { success: false }, { name: 'cache' });
      define(database, 'Database');
      define(cache, 'Cache');

      const result = await service.checkHealth();

      expect(Object.keys(result).sort()).toEqual(['cache', 'database']);
      expect(database.checkHealth).toHaveBeenCalled();
      expect(cache.checkHealth).toHaveBeenCalled();
    });

    test('returns an empty result without registered checks', async () => {
      await expect(service.checkHealth()).resolves.toEqual({});
    });
  });

  describe('checkReadiness', () => {
    test('reports the application as ready', async () => {
      await expect(service.checkReadiness()).resolves.toBe(true);
    });
  });
});
