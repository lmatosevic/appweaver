import { PassThrough } from 'node:stream';
import { ServerResponse } from 'node:http';
import { StreamFrame } from '../../stream/stream-frame';
import { ResponseSink } from '../../transport/response-sink';

function response() {
  const stream = new PassThrough() as unknown as ServerResponse & PassThrough;
  const chunks: string[] = [];
  stream.on('data', (chunk) => chunks.push(String(chunk)));
  return { response: stream, chunks };
}

const start = {
  sid: 1,
  streamId: 's1',
  name: 'assistant',
  key: 's1',
  codec: 'binary' as const,
  mimeType: 'audio/mpeg',
  seq: 0
};

describe('ResponseSink', () => {
  test('writes the stream as the events of the response, ending it with the stream', async () => {
    const { response: res, chunks } = response();
    const head = jest.fn();
    const sink = new ResponseSink(res, 'assistant', head);
    const frame = new StreamFrame({ type: 'chunk', sid: 1, seq: 0, data: 'a' });

    sink.start(start);
    sink.write(frame);
    sink.gap(1, 1, 3);
    sink.finish();
    sink.finish();
    sink.write(frame);
    await new Promise((resolve) => setImmediate(resolve));

    expect(head).toHaveBeenCalledTimes(1);
    expect(chunks).toEqual([
      'data: {"type":"stream.start","id":"assistant","sid":1,"streamId":"s1","stream":"assistant","key":"s1","codec":"binary","mimeType":"audio/mpeg","seq":0}\n\n',
      frame.sse,
      'data: {"type":"stream.gap","sid":1,"from":1,"to":3}\n\n'
    ]);
    expect(sink.bufferedAmount()).toBe(0);
  });

  test('ends the response of a client reading too slowly', () => {
    const { response: res } = response();
    const sink = new ResponseSink(res, 'assistant', jest.fn());

    sink.overflow();

    expect(res.writableEnded).toBe(true);
  });
});
