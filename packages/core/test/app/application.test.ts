import { LIFECYCLE } from '@appweaver/common';
import { define } from '../../context';
import { Application } from '../../app/application';
import { resetContext } from '../fixtures/context-fixture';

describe('application', () => {
  const events = [
    'SIGTERM',
    'SIGINT',
    'unhandledRejection',
    'uncaughtException'
  ] as const;

  let calls: string[];
  let server: any;

  const listenerCounts = () =>
    events.map((event) => process.listenerCount(event));

  beforeEach(() => {
    resetContext();
    // Starting freezes the context, which the fixture has to reset afterward
    jest.spyOn(Object, 'freeze').mockImplementation((value: any) => value);

    calls = [];
    server = {
      close: jest.fn(async () => {
        calls.push('server.close');
      }),
      listen: jest.fn(async () => 'http://localhost:5000'),
      addresses: jest.fn(() => [])
    };

    define({
      [LIFECYCLE]: true,
      onInit: async () => undefined,
      onDestroy: async () => {
        calls.push('service.onDestroy');
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    resetContext();
  });

  describe('start', () => {
    test('adds the process handlers once per start', async () => {
      const before = listenerCounts();
      const app = new Application(server);

      await app.start(false);

      expect(listenerCounts()).toEqual(before.map((count) => count + 1));
      await app.stop();
    });
  });

  describe('stop', () => {
    test('removes the process handlers added on start', async () => {
      const before = listenerCounts();
      const app = new Application(server);

      await app.start(false);
      await app.stop();
      await app.start(false);
      await app.stop();

      expect(listenerCounts()).toEqual(before);
    });

    test('closes the server before destroying the services', async () => {
      const app = new Application(server);

      await app.start(false);
      await app.stop();

      expect(calls).toEqual(['server.close', 'service.onDestroy']);
    });
  });
});
