import { TSchema } from '@sinclair/typebox';
import { PubSub, uuid } from '@appweaver/common';
import { inject } from '@appweaver/core';
import { Channel, ChannelConfig } from './types';
import { createRegistry } from './utils/registry';
import { validatePayload } from './utils/validate';

/** The key of the channels in the application context. */
export const REALTIME_CHANNEL = Symbol.for('appweaver.RealtimeChannel');

/** The prefix of the channels of the resource events. */
export const RESOURCE_CHANNEL_PREFIX = 'resource:';

/** The prefix of the channels of the pub/sub every realtime message is published to. */
export const PUBSUB_CHANNEL_PREFIX = 'realtime:';

/** A message of a channel, as it is published to the pub/sub. */
export type ChannelMessage = { eventId: string; payload: unknown };

const channels = createRegistry<Channel>(REALTIME_CHANNEL, 'channel', (name) =>
  name.startsWith(RESOURCE_CHANNEL_PREFIX)
);

/**
 * Creates a channel, publishing its payloads to the realtime connections subscribed to it on every instance. The
 * channels of the application are created in its files, and the ones of a module in its `main` or `web` part.
 *
 * @example
 * export const orderShipped = createChannel({
 *   name: 'order.shipped',
 *   payload: Type.Object({ orderId: Type.Integer(), carrier: Type.String() }),
 *   params: Type.Object({ orderId: Type.Optional(Type.Integer()) }),
 *   roles: ['customer'],
 *   deliver: (user, payload, params) => !params.orderId || params.orderId === payload.orderId
 * });
 *
 * await orderShipped.publish({ orderId: 1, carrier: 'DHL' });
 *
 * @param {ChannelConfig} config - The name, the schemas and the access checks of the channel.
 * @return {Channel} The channel, defined in the application context.
 * @throws {ConfigurationError} `CONFIGURATION_INVALID` for an invalid name, or one already taken.
 */
export function createChannel<P extends TSchema, Q extends TSchema = TSchema>(
  config: ChannelConfig<P, Q>
): Channel<P, Q> {
  const channel: Channel<P, Q> = {
    name: config.name,
    config,
    publish: async (payload) => {
      validatePayload(config.payload, payload);
      const message: ChannelMessage = { eventId: uuid(), payload };
      await inject(PubSub).publish(
        PUBSUB_CHANNEL_PREFIX + config.name,
        message
      );
    }
  };

  return channels.add(channel) as Channel<P, Q>;
}

/**
 * Lists the channels of the application and of the modules.
 *
 * @return {Channel[]} The channels.
 */
export function realtimeChannels(): Channel[] {
  return channels.all();
}

/**
 * Finds a channel by its name.
 *
 * @param {string} name - The name of the channel.
 * @return {Channel | undefined} The channel, or `undefined` when none has the name.
 */
export function findChannel(name: string): Channel | undefined {
  return channels.find(name);
}
