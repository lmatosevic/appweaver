import { createLogger, PubSub, PubSubHandler, uuidv4 } from '@appweaver/common';

const logger = createLogger('pubsub');

/** The in-process `memory` driver of `PubSub`, reaching the subscribers of its own process only. */
export class MemoryPubSub extends PubSub {
  /** @internal */
  private readonly _subscriptions = new Map<
    string,
    { channel: string; handler: PubSubHandler }
  >();

  public async onDestroy(): Promise<void> {
    this._subscriptions.clear();
  }

  public async publish<T>(channel: string, message: T): Promise<void> {
    // A JSON copy, as a server driver delivers it, so no subscriber shares or
    // changes the object of the publisher
    const json = JSON.stringify(message ?? null);

    for (const { channel: name, handler } of this._subscriptions.values()) {
      if (name === channel) {
        // Delivered after the publish, as a server driver delivers it
        setImmediate(() => this.deliver(channel, handler, JSON.parse(json)));
      }
    }
  }

  public async subscribe<T>(
    channel: string,
    handler: PubSubHandler<T>
  ): Promise<string> {
    const subscriptionId = uuidv4();
    this._subscriptions.set(subscriptionId, { channel, handler });
    return subscriptionId;
  }

  public async unsubscribe(subscriptionId: string): Promise<boolean> {
    return this._subscriptions.delete(subscriptionId);
  }

  /** @internal */
  private async deliver(
    channel: string,
    handler: PubSubHandler,
    message: unknown
  ): Promise<void> {
    try {
      await handler(message);
    } catch (e) {
      logger.error(e, `Subscriber of the '${channel}' channel failed`);
    }
  }
}
