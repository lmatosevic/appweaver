import { LIFECYCLE } from '@appweaver/common';
import { LifecycleManager } from '../../app/lifecycle-manager';
import { define } from '../../context/dependency-injection';
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
  });
});
