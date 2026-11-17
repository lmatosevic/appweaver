import { Type } from '@sinclair/typebox';
import { ActionCall } from '../../gateway/action-call';
import { InputStream, inputSettings } from '../../stream/input-stream';
import { StreamInstance, streamSettings } from '../../stream/stream-instance';
import { FakeSink } from '../fixtures/fake-sink';

const action = {
  name: 'voice',
  config: { name: 'voice', payload: Type.Object({}), handler: () => undefined }
};

const create = (withOutput = true) => {
  const output = withOutput
    ? new StreamInstance(1, 's1', 'voice', 's1', streamSettings())
    : undefined;
  const input = new InputStream(inputSettings());
  const sink = new FakeSink();
  output?.attach(sink);
  const call = new ActionCall(action, { id: 7 } as never, output, input);
  return { call, output, input, sink };
};

describe('ActionCall', () => {
  test('takes the ID of its stream, or one of its own', () => {
    expect(create().call.id).toBe('s1');
    expect(create(false).call.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(create().call.userId).toBe('7');
    expect(new ActionCall(action as never, null).userId).toBeNull();
  });

  test('cancels its stream and its input', async () => {
    const { call, sink, input } = create();
    const reading = input[Symbol.asyncIterator]().next();

    call.cancel();
    call.cancel();

    expect(call.ended).toBe(true);
    expect(call.signal.aborted).toBe(true);
    expect(sink.messages.at(-1)).toMatchObject({ cancelled: true });
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('fails with an error sent to the client', async () => {
    const { call, sink, input } = create();
    const reading = input[Symbol.asyncIterator]().next();
    const error = new Error('denied');

    call.fail(error);
    call.fail(new Error('ignored'));

    expect(call.error).toBe(error);
    expect(sink.messages.at(-1)).toMatchObject({ type: 'stream.error' });
    await expect(reading).rejects.toThrow('denied');
  });

  test('ends with its stream, or once its handler returned', () => {
    const { call, output } = create();
    output!.end();
    expect(call.ended).toBe(true);

    const { call: withoutOutput } = create(false);
    withoutOutput.finish();
    expect(withoutOutput.ended).toBe(true);
  });
});
