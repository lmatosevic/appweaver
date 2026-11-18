import { ConnectionSink } from '../../gateway/connection-sink';
import { StreamFrame } from '../../stream/stream-frame';
import { FakeConnection } from '../fixtures/fake-connection';

describe('ConnectionSink', () => {
  test('writes a stream to the connection as the messages of its subscription', () => {
    const connection = new FakeConnection();
    connection.buffered = 7;
    const overflow = jest.fn();
    const finish = jest.fn();
    const sink = new ConnectionSink(connection, 's', overflow, finish);
    const frame = new StreamFrame({ type: 'chunk', sid: 1, seq: 0, data: 'a' });

    sink.start({
      sid: 1,
      streamId: 'id',
      name: 'radio',
      key: 'jazz',
      codec: 'binary',
      mimeType: 'audio/mpeg',
      seq: 0
    });
    sink.write(frame);
    sink.gap(1, 1, 2);
    sink.overflow();
    sink.finish(1);

    expect(connection.messages).toEqual([
      {
        type: 'stream.start',
        id: 's',
        sid: 1,
        streamId: 'id',
        stream: 'radio',
        key: 'jazz',
        codec: 'binary',
        mimeType: 'audio/mpeg',
        seq: 0
      },
      frame.message,
      { type: 'stream.gap', sid: 1, from: 1, to: 2 }
    ]);
    expect(sink.bufferedAmount()).toBe(7);
    expect(overflow).toHaveBeenCalled();
    expect(finish).toHaveBeenCalledWith(1);
  });

  test('ignores the end of a stream without a finish callback', () => {
    expect(() =>
      new ConnectionSink(new FakeConnection(), 's', jest.fn()).finish(1)
    ).not.toThrow();
  });
});
