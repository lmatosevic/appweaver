import { Stream, StreamSink } from '../stream/types';
import { Channel } from '../types';
import { ActionCall } from './action-call';

/** A subscription of a connection: to a channel, to the events of a resource, to a stream, or of a call of an action
 * with a stream or an input. */
export type ActiveSubscription = {
  /** The ID the client chose, the ID of the call of an action */
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
      kind: 'action-call';
      /** The call of an action with a stream or an input */
      call: ActionCall;
      /** The subscriber of the stream of the call, writing to the connection */
      sink?: StreamSink;
    }
);
