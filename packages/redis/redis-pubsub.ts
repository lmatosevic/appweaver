import { Redis as RedisClient } from 'ioredis';
import { createLogger, PubSub, PubSubHandler, uuidv4 } from '@appweaver/common';
import { redisConfig, redisPubSubConfig } from './config';

const logger = createLogger('pubsub');

/**
 * The `redis` driver of `PubSub`, publishing the messages on the Redis server of the memory (`memory.redis.url`), so
 * the subscribers of every process receive them. A subscribed connection runs no other command, so the driver opens
 * one for publishing and one for subscribing, connected on the first use.
 */
export class RedisPubSub extends PubSub {
  /** @internal */
  private readonly _subscriptions = new Map<
    string,
    { channel: string; handler: PubSubHandler }
  >();
  /** @internal */
  private _publisher?: RedisClient;
  /** @internal */
  private _subscriber?: RedisClient;

  public async onDestroy(): Promise<void> {
    this._subscriptions.clear();
    const clients = [this._publisher, this._subscriber].filter(
      (client): client is RedisClient => client !== undefined
    );
    await Promise.all(
      clients.map((client) => client.quit().catch(() => client.disconnect()))
    );
    this._publisher = undefined;
    this._subscriber = undefined;
  }

  public async publish<T>(channel: string, message: T): Promise<void> {
    this._publisher ??= this.createClient('appweaver-publisher');
    await this._publisher.publish(
      this.channelName(channel),
      JSON.stringify(message ?? null)
    );
  }

  public async subscribe<T>(
    channel: string,
    handler: PubSubHandler<T>
  ): Promise<string> {
    const subscriber = this.subscriber();
    const subscriptionId = uuidv4();
    const subscribed = this.isSubscribed(channel);

    this._subscriptions.set(subscriptionId, { channel, handler });

    if (!subscribed) {
      await subscriber.subscribe(this.channelName(channel));
    }

    return subscriptionId;
  }

  public async unsubscribe(subscriptionId: string): Promise<boolean> {
    const subscription = this._subscriptions.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    this._subscriptions.delete(subscriptionId);

    if (!this.isSubscribed(subscription.channel)) {
      await this._subscriber?.unsubscribe(
        this.channelName(subscription.channel)
      );
    }

    return true;
  }

  /** @internal */
  private subscriber(): RedisClient {
    if (!this._subscriber) {
      this._subscriber = this.createClient('appweaver-subscriber');
      this._subscriber.on('message', (name: string, json: string) =>
        this.dispatch(name, json)
      );
    }
    return this._subscriber;
  }

  /** @internal */
  private createClient(connectionName: string): RedisClient {
    const client = new RedisClient(redisConfig.URL, { connectionName });
    client.on('error', (e) => logger.error(e, 'Redis pub/sub error'));
    return client;
  }

  /** @internal */
  private dispatch(name: string, json: string): void {
    const channel = name.slice(redisPubSubConfig.CHANNEL_PREFIX.length);

    let message: unknown;
    try {
      message = JSON.parse(json);
    } catch (e) {
      logger.error(e, `Invalid message of the '${channel}' channel`);
      return;
    }

    for (const subscription of this._subscriptions.values()) {
      if (subscription.channel === channel) {
        // Every subscriber gets its own copy, as with the memory driver
        const copy = structuredClone(message);
        Promise.resolve()
          .then(() => subscription.handler(copy))
          .catch((e) =>
            logger.error(e, `Subscriber of the '${channel}' channel failed`)
          );
      }
    }
  }

  /** @internal */
  private isSubscribed(channel: string): boolean {
    for (const subscription of this._subscriptions.values()) {
      if (subscription.channel === channel) {
        return true;
      }
    }
    return false;
  }

  /** @internal */
  private channelName(channel: string): string {
    return redisPubSubConfig.CHANNEL_PREFIX + channel;
  }
}
