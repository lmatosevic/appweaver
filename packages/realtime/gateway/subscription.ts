import { Channel } from '../types';

/** A subscription of a connection to a channel. */
export type ActiveSubscription = {
  /** The ID the client chose */
  id: string;
  /** The channel the client subscribed to, i.e. `resource:Order.update` */
  channel: string;
  /** The pub/sub channel the messages of the channel are published to */
  pubsubChannel: string;
  /** The parameters of a channel subscription */
  params: Record<string, unknown>;
} & (
  | {
      kind: 'resource';
      /** The name of the model */
      model: string;
      /** The action the client subscribed to, every action of the model when none */
      action?: string;
      /** The actions whose events the subscription receives, the ones of `action` the user has the access of */
      actions: Set<string>;
      /** The `where` filter of Prisma the resource must match, mapped from the filter of the client */
      where?: Record<string, unknown>;
    }
  | {
      kind: 'channel';
      /** The channel of the application or of a module */
      definition: Channel;
    }
);
