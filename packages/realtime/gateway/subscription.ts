import { Stream, StreamSink } from '../stream/types';
import { StreamInstance } from '../stream/stream-instance';
import { Channel } from '../types';

/** A subscription of a connection: to a channel, to the events of a resource, to a stream, or of a streaming action. */
export type ActiveSubscription = {
  /** The ID the client chose, the ID of the call of a streaming action */
  id: string;
  /** The channel the client subscribed to, i.e. `resource:Order.update`, `stream:radio.live` */
  channel: string;
  /** The parameters of a channel or a stream subscription */
  params: Record<string, unknown>;
} & (
  | {
      kind: 'resource';
      /** The pub/sub channel the messages of the channel are published to */
      pubsubChannel: string;
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
      /** The pub/sub channel the messages of the channel are published to */
      pubsubChannel: string;
      /** The channel of the application or of a module */
      definition: Channel;
    }
  | {
      kind: 'stream';
      /** The stream of the application or of a module */
      definition: Stream;
      /** The key of the stream */
      key: string;
      /** The subscriber of the stream, writing to the connection */
      sink: StreamSink;
      /** The stream of the key to resume */
      resume?: { streamId: string; seq: number };
    }
  | {
      kind: 'action-stream';
      /** The stream of the call of the action */
      instance: StreamInstance;
      /** The subscriber of the stream, writing to the connection */
      sink: StreamSink;
    }
);
