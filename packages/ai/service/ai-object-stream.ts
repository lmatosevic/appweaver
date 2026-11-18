import { Static, TSchema } from '@sinclair/typebox';
import { parsePartialJson } from '../utils/json-util';
import { AiStream } from './ai-stream';
import { AiObjectResult } from './prompt';

/** A value with every property optional, at every depth: an object while it is streamed. */
export type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/**
 * A streamed object of a model: an async iterable of the object parsed so far, each one yielded once it changes, with
 * the object once it ends, checked against its schema.
 *
 * @example
 * const stream = ai.streamObject({ prompt: 'List three cities', schema: Cities });
 * for await (const partial of stream) {
 *   render(partial.cities ?? []);
 * }
 * const cities = await stream.object;
 */
export class AiObjectStream<T extends TSchema> implements AsyncIterable<
  DeepPartial<Static<T>>
> {
  constructor(private readonly stream: AiStream<AiObjectResult<T>>) {}

  /** The result once the stream ends, with the object. */
  public get result(): Promise<AiObjectResult<T>> {
    return this.stream.result;
  }

  /** The object once the stream ends, matching the schema. */
  public get object(): Promise<Static<T>> {
    return this.stream.result.then((result) => result.object);
  }

  /** Aborted once the stream is aborted. */
  public get signal(): AbortSignal {
    return this.stream.signal;
  }

  /**
   * Aborts the stream.
   *
   * @param {unknown} [reason] - The reason of the abort.
   */
  public abort(reason?: unknown): void {
    this.stream.abort(reason);
  }

  public async *[Symbol.asyncIterator](): AsyncIterator<
    DeepPartial<Static<T>>
  > {
    let text = '';
    let last: string | undefined;
    for await (const part of this.stream.parts()) {
      if (part.type !== 'text-delta') {
        continue;
      }
      text += part.text;
      const value = parsePartialJson(text);
      const key = JSON.stringify(value);
      if (value !== undefined && key !== last) {
        last = key;
        yield value as DeepPartial<Static<T>>;
      }
    }
  }
}
