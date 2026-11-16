import { EventEmitter } from 'node:events';
import { WsConnection } from '../../transport/ws-connection';
import { RealtimeCloseCode } from '../../types';

const auth = { user: null, authType: null, authSource: null, expiresAt: null };

class FakeSocket extends EventEmitter {
  public readonly OPEN = 1;
  public readyState = 1;
  public bufferedAmount = 5;
  public sent: string[] = [];
  public pings = 0;
  public terminated = false;
  public closedWith?: [number, string];

  send(data: string) {
    this.sent.push(data);
  }
  ping() {
    this.pings++;
  }
  terminate() {
    this.terminated = true;
  }
  close(code: number, reason: string) {
    this.closedWith = [code, reason];
  }
}

describe('WsConnection', () => {
  test('sends the messages as JSON while open', () => {
    const socket = new FakeSocket();
    const connection = new WsConnection(auth, socket as never);

    connection.send({ type: 'pong' });
    socket.readyState = 3;
    connection.send({ type: 'pong' });

    expect(socket.sent).toEqual(['{"type":"pong"}']);
    expect(connection.bufferedAmount()).toBe(5);
  });

  test('terminates a client answering no ping', () => {
    const socket = new FakeSocket();
    const connection = new WsConnection(auth, socket as never);

    connection.heartbeat();
    socket.emit('pong');
    connection.heartbeat();
    connection.heartbeat();

    expect(socket.pings).toBe(2);
    expect(socket.terminated).toBe(true);
  });

  test('sends no heartbeat to a closed socket', () => {
    const socket = new FakeSocket();
    const connection = new WsConnection(auth, socket as never);

    connection.close(RealtimeCloseCode.GoingAway, 'Bye');
    connection.close(RealtimeCloseCode.GoingAway, 'Again');
    connection.heartbeat();

    expect(socket.closedWith).toEqual([1001, 'Bye']);
    expect(socket.pings).toBe(0);
  });
});
