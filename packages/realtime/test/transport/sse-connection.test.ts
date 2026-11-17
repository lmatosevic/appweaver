import { PassThrough } from 'node:stream';
import { ServerResponse } from 'node:http';
import { SseConnection } from '../../transport/sse-connection';
import { RealtimeCloseCode } from '../../types';

const auth = { user: null, authType: null, authSource: null, expiresAt: null };

function response() {
  const stream = new PassThrough();
  const chunks: string[] = [];
  stream.on('data', (chunk) => chunks.push(String(chunk)));
  return { response: stream as unknown as ServerResponse, chunks };
}

describe('SseConnection', () => {
  test('starts the stream before the first message', () => {
    const { response: res, chunks } = response();
    const start = jest.fn();
    const connection = new SseConnection(auth, res, start);

    connection.send({ type: 'pong' });
    connection.send({
      type: 'event',
      id: 's',
      channel: 'news',
      eventId: 'e1',
      data: 1
    });
    connection.heartbeat();

    expect(start).toHaveBeenCalledTimes(1);
    expect(chunks).toEqual([
      'data: {"type":"pong"}\n\n',
      'id: e1\ndata: {"type":"event","id":"s","channel":"news","eventId":"e1","data":1}\n\n',
      ': ping\n\n'
    ]);
    expect(connection.bufferedAmount()).toBe(0);
  });

  test('ends the stream with the reason as a comment', async () => {
    const { response: res, chunks } = response();
    const connection = new SseConnection(auth, res, () => undefined);
    connection.send({ type: 'pong' });

    connection.close(RealtimeCloseCode.GoingAway, 'Bye');
    connection.close(RealtimeCloseCode.GoingAway, 'Again');
    connection.send({ type: 'pong' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(chunks.slice(1)).toEqual([': close 1001 Bye\n\n']);
    expect(connection.closed).toBe(true);
  });

  test('closes a stream never started without writing', () => {
    const { response: res, chunks } = response();
    const start = jest.fn();
    const connection = new SseConnection(auth, res, start);

    connection.close(RealtimeCloseCode.GoingAway, 'Bye');

    expect(start).not.toHaveBeenCalled();
    expect(chunks).toEqual([]);
  });
});
