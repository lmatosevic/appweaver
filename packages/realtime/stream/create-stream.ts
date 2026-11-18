import { TSchema } from '@sinclair/typebox';
import { inject } from '@appweaver/core';
import { createRegistry } from '../utils/registry';
import { StreamHub } from './stream-hub';
import { Stream, StreamCodec, StreamConfig } from './types';

/** The key of the streams in the application context. */
export const REALTIME_STREAM = Symbol.for('appweaver.RealtimeStream');

/** The prefix of the subscriptions to a stream, i.e. `stream:radio.live`. */
export const STREAM_CHANNEL_PREFIX = 'stream:';

const streams = createRegistry<Stream>(REALTIME_STREAM, 'stream');

/**
 * Creates a stream: the chunks of text, JSON values or bytes a producer writes to the subscribers of a key, i.e. the
 * answer of an LLM shown in a chat room, or a radio station. A subscriber is checked once when it subscribes, never
 * per chunk, the chunks are encoded once for every subscriber, and they reach the other instances only while one of
 * them has a subscriber of the key, in batches.
 *
 * @example
 * export const roomAnswer = createStream({
 *   name: 'room.answer',
 *   params: Type.Object({ roomId: Type.Integer() }),
 *   subscribe: (user, { roomId }) => isMember(user, roomId)
 * });
 *
 * const writer = roomAnswer.open(String(roomId));
 * writer.write('Hello');
 * writer.end();
 *
 * @param {StreamConfig} config - The name, the codec, the schemas and the access checks of the stream.
 * @return {Stream} The stream, defined in the application context.
 * @throws {ConfigurationError} `CONFIGURATION_INVALID` for an invalid name, or one already taken.
 */
export function createStream<
  C extends StreamCodec = 'text',
  J extends TSchema = TSchema,
  Q extends TSchema = TSchema
>(config: StreamConfig<C, J, Q>): Stream<C, J, Q> {
  const stream: Stream<C, J, Q> = {
    name: config.name,
    config,
    open: (key = '') => inject(StreamHub).open(stream, key)
  };
  return streams.add(stream) as never;
}

/**
 * Lists the streams of the application and of the modules.
 *
 * @return {Stream[]} The streams.
 */
export function realtimeStreams(): Stream[] {
  return streams.all();
}

/**
 * Finds a stream by its name.
 *
 * @param {string} name - The name of the stream.
 * @return {Stream | undefined} The stream, or `undefined` when none has the name.
 */
export function findStream(name: string): Stream | undefined {
  return streams.find(name);
}
