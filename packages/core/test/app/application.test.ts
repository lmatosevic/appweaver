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
  let onReady: jest.Mock;

  const listenerCounts = () =>
    events.map((event) => process.listenerCount(event));

  beforeEach(() => {
    resetContext();
    // Starting freezes the context, which the fixture has to reset afterward
    jest.spyOn(Object, 'freeze').mockImplementation((value: any) => value);

    calls = [];
    onReady = jest.fn();

    // Serves the requests like the HTTP server does
    define(
      {
        [LIFECYCLE]: true,
        onReady,
        onShutdown: async () => {
          calls.push('server.close');
        }
      },
      'HttpServer'
    );
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
      const app = new Application();

      await app.start(false);

      expect(listenerCounts()).toEqual(before.map((count) => count + 1));
      await app.stop();
    });

    test('tells the services it is ready, with the server start option', async () => {
      const app = new Application();

      await app.start(false);

      expect(onReady).toHaveBeenCalledWith({ startServer: false });
      await app.stop();
    });
  });

  describe('stop', () => {
    test('removes the process handlers added on start', async () => {
      const before = listenerCounts();
      const app = new Application();

      await app.start(false);
      await app.stop();
      await app.start(false);
      await app.stop();

      expect(listenerCounts()).toEqual(before);
    });

    test('shuts the server down before destroying the services', async () => {
      const app = new Application();

      await app.start(false);
      await app.stop();

      expect(calls).toEqual(['server.close', 'service.onDestroy']);
    });
  });
});
