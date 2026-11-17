import { OnDestroy } from '../interfaces';
import { LIFECYCLE } from '../constants';

/** Receives the messages published to a channel. */
export type PubSubHandler<T = any> = (message: T) => unknown;

/**
 * Publishes messages to the subscribers of a channel, in the process (`memory`) or in every process sharing a server
 * (`redis`), i.e. the events the realtime connections of every instance deliver. A message is a JSON value, so every
 * subscriber receives a copy of it, with its dates as ISO strings.
 */
export abstract class PubSub implements OnDestroy {
  static [LIFECYCLE] = true;

  abstract onDestroy(): Promise<void>;

  /**
   * Publishes a message to every subscriber of a channel.
   *
   * @param {string} channel - The channel to publish to.
   * @param {Object} message - The message, a JSON value.
   * @return {Promise<void>} A promise resolving once the message is published.
   */
  abstract publish<T>(channel: string, message: T): Promise<void>;

  /**
   * Subscribes to the messages of a channel.
   *
   * @param {string} channel - The channel to subscribe to.
   * @param {PubSubHandler} handler - Receives every message published to the channel after the subscription.
   * @return {Promise<string>} The ID of the subscription, for {@link PubSub.unsubscribe}.
   */
  abstract subscribe<T>(
    channel: string,
    handler: PubSubHandler<T>
  ): Promise<string>;

  /**
   * Removes a subscription.
   *
   * @param {string} subscriptionId - The ID returned by {@link PubSub.subscribe}.
   * @return {Promise<boolean>} `true` if the subscription was found and removed, `false` otherwise.
   */
  abstract unsubscribe(subscriptionId: string): Promise<boolean>;
}
