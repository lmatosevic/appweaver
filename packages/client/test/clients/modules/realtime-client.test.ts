import { RealtimeClient } from '../../../clients/modules/realtime-client';
import { createStubClient } from '../../fixtures/stub-client';

describe('RealtimeClient', () => {
  const FakeWebSocket = class {} as unknown as typeof WebSocket;

  const realtime = (
    transport?: 'auto' | 'websocket' | 'sse',
    serverTransports?: ('websocket' | 'sse')[],
    WebSocketClass: typeof WebSocket | undefined = FakeWebSocket
  ) =>
    new RealtimeClient(
      createStubClient().client,
      '/api/realtime',
      { transport, WebSocket: WebSocketClass },
      serverTransports
    );

  describe('transport', () => {
    test('chooses the WebSocket the runtime has and the server enables', () => {
      expect(realtime().transport).toBe('websocket');
      expect(realtime('auto', ['sse', 'websocket']).transport).toBe(
        'websocket'
      );
    });

    test('chooses SSE on a server without the WebSocket', () => {
      expect(realtime('auto', ['sse']).transport).toBe('sse');
    });

    test('chooses SSE in a runtime without a WebSocket', () => {
      const withoutWebSocket = new RealtimeClient(
        createStubClient().client,
        '/api/realtime',
        { WebSocket: undefined },
        ['sse', 'websocket']
      );
      const global = globalThis as { WebSocket?: typeof WebSocket };
      const original = global.WebSocket;
      global.WebSocket = undefined;
      try {
        expect(withoutWebSocket.transport).toBe('sse');
      } finally {
        global.WebSocket = original;
      }
    });

    test('keeps the WebSocket of a server enabling only it', () => {
      expect(realtime('auto', ['websocket']).transport).toBe('websocket');
    });

    test('keeps the transport of the options', () => {
      expect(realtime('sse', ['websocket']).transport).toBe('sse');
    });
  });
});
