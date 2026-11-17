import { StreamInstance } from './stream-instance';

/**
 * Writes the chunks of an async iterable, i.e. the generator of a streaming action, to a stream, ending it with the
 * value the iterable returns, or with its error. The iterable is pulled only while every subscriber is below the
 * high-water mark, and stopped once the stream is cancelled.
 *
 * @param {StreamInstance} instance - The stream.
 * @param {AsyncIterable} iterable - The chunks.
 * @return {Promise<void>} Resolves once the stream ended.
 */
export async function pumpStream(
  instance: StreamInstance,
  iterable: AsyncIterable<unknown>
): Promise<void> {
  const iterator = iterable[Symbol.asyncIterator]();
  try {
    for (;;) {
      if (instance.ended) {
        await iterator.return?.();
        return;
      }
      const { done, value } = await iterator.next();
      if (instance.ended) {
        await iterator.return?.();
        return;
      }
      if (done) {
        instance.end(value ?? undefined);
        return;
      }
      instance.write(value);
      await instance.ready;
    }
  } catch (e) {
    instance.error(e);
  }
}
