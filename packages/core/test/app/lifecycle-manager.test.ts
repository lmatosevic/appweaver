import { LIFECYCLE } from '@appweaver/common';
import { LifecycleManager } from '../../app/lifecycle-manager';
import { define } from '../../context/dependency-injection';
import { HealthService } from '../../health/health-service';
import { resetContext } from '../fixtures/context-fixture';

const created: string[] = [];
const calls: string[] = [];

class Database {
  static [LIFECYCLE] = true;

  constructor() {
    created.push('Database');
  }

  public onInit() {
    calls.push('Database.onInit');
  }

  public onDestroy() {
    calls.push('Database.onDestroy');
  }
}

class Server {
  static [LIFECYCLE] = true;

  constructor() {
    created.push('Server');
  }

  public onReady() {
    calls.push('Server.onReady');
  }

  public onShutdown() {
    calls.push('Server.onShutdown');
  }
}

class Manager extends LifecycleManager {}

describe('lifecycle-manager', () => {
  beforeEach(() => {
    resetContext();
    created.length = 0;
    calls.length = 0;
    define(Database);
    define(Server);
  });

  afterAll(() => {
    resetContext();
  });

  describe('init / destroy', () => {
    test('never creates the services of a manager that is not ready', async () => {
      const manager = new Manager();

      await manager.init();
      await manager.destroy();

      expect(created).toEqual(['Database']);
      expect(calls).toEqual(['Database.onInit', 'Database.onDestroy']);
    });
  });

  describe('ready', () => {
    test('creates the ready services, and shuts them down before the destroy', async () => {
      const manager = new Manager();

      await manager.init();
      await manager.ready();
      await manager.destroy();

      expect(created).toEqual(['Database', 'Server']);
      expect(calls).toEqual([
        'Database.onInit',
        'Server.onReady',
        'Server.onShutdown',
        'Database.onDestroy'
      ]);
    });

    test('reports the application as ready once every service is ready, until its shutdown', async () => {
      const readiness: string[] = [];
      const health = new HealthService();
      const record = async (step: string) =>
        readiness.push(`${step}: ${await health.checkReadiness()}`);

      /** A service still starting while the server listens. */
      class Worker {
        static [LIFECYCLE] = true;

        public onReady() {
          return record('onReady');
        }

        public onShutdown() {
          return record('onShutdown');
        }
      }

      define(health, HealthService);
      define(Worker);
      const manager = new Manager();

      await manager.init();
      await manager.ready();
      await record('ready');
      await manager.destroy();

      expect(readiness).toEqual([
        'onReady: false',
        'ready: true',
        'onShutdown: false'
      ]);
    });

    test('sets no readiness without the health service', async () => {
      const manager = new Manager();

      await manager.init();
      await expect(manager.ready()).resolves.toBeUndefined();
      await expect(manager.destroy()).resolves.toBeUndefined();
    });
  });
});
