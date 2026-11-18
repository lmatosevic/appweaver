import { Static, TSchema } from '@sinclair/typebox';
import {
  AuthUser,
  ProblemDetails,
  RealtimeAccess,
  ResourceEvent
} from '@appweaver/common';
import {
  StreamChunk,
  StreamCodec,
  StreamFrameMessage,
  StreamOptions
} from './stream/types';

export type { RealtimeAccess };

/** The config of a channel of {@link createChannel}. */
export type ChannelConfig<
  P extends TSchema = TSchema,
  Q extends TSchema = TSchema
> = RealtimeAccess & {
  /** The name of the channel, i.e. `order.shipped`, never starting with `resource:` or `stream:` */
  name: string;
  /** The schema of the published payloads, validated by {@link Channel.publish} */
  payload: P;
  /** The description of the channel in the OpenAPI document */
  description?: string;
  /** The schema of the parameters of a subscription, validated when subscribing */
  params?: Q;
  /** Returns false to deny a subscription, called once when the client subscribes */
  subscribe?(
    user: AuthUser | null,
    params: Static<Q>
  ): boolean | Promise<boolean>;
  /** Returns false to keep a payload from a subscription, called for every payload and subscription */
  deliver?(
    user: AuthUser | null,
    payload: Static<P>,
    params: Static<Q>
  ): boolean | Promise<boolean>;
};

/** A channel of the application or of a module, publishing its payloads to the subscribed realtime connections. */
export type Channel<
  P extends TSchema = TSchema,
  Q extends TSchema = TSchema
> = {
  /** The name of the channel */
  readonly name: string;
  /** The config of the channel */
  readonly config: ChannelConfig<P, Q>;
  /**
   * Publishes a payload to the subscriptions of every instance, validated against the `payload` schema.
   *
   * @param {Object} payload - The payload.
   * @return {Promise<void>} A promise resolving once the payload is published.
   */
  publish(payload: Static<P>): Promise<void>;
};

/** What the handler of an action receives besides its payload. */
export type RealtimeActionContext = {
  /** The user of the connection or the request, null when anonymous */
  user: AuthUser | null;
  /** The transport the action was called on */
  transport: 'websocket' | 'http';
  /** The ID of the WebSocket connection calling the action */
  connectionId?: string;
  /** Whether the client waits for the result, false for a fire-and-forget message */
  ack: boolean;
  /** Aborted once the stream of a streaming action is cancelled, its client gone, or the instance shuts down */
  signal?: AbortSignal;
};

/** The config of an action of {@link createRealtimeAction}. */
export type RealtimeActionConfig<
  P extends TSchema = TSchema,
  R extends TSchema = TSchema,
  C extends StreamCodec = StreamCodec,
  J extends TSchema = TSchema
> = RealtimeAccess & {
  /** The name of the action, i.e. `chat.typing` */
  name: string;
  /** The schema of the payloads, validated before the handler runs */
  payload: P;
  /**
   * Handles a call of the action, run as the user of the connection or the request. The handler of a streaming
   * action returns an async iterable, i.e. it is an async generator, whose chunks are streamed to the caller and
   * whose return value is the result.
   */
  handler(
    payload: Static<P>,
    context: RealtimeActionContext
  ):
    | Static<R>
    | void
    | Promise<Static<R> | void>
    | AsyncIterable<StreamChunk<C, J>>
    | AsyncGenerator<StreamChunk<C, J>, Static<R> | void>;
  /** The schema of the result, none for an action without one */
  response?: R;
  /** Streams the chunks of the handler to the caller only, ended with the result: the settings of the stream */
  stream?: StreamOptions<C, J>;
  /** The description of the action in the OpenAPI document */
  description?: string;
};

/** An action clients call over the WebSocket or the HTTP route of the actions, never a CRUD operation. */
export type RealtimeAction<
  P extends TSchema = TSchema,
  R extends TSchema = TSchema,
  C extends StreamCodec = StreamCodec,
  J extends TSchema = TSchema
> = {
  /** The name of the action */
  readonly name: string;
  /** The config of the action */
  readonly config: RealtimeActionConfig<P, R, C, J>;
};

/** A subscription a client asks for, in a `subscribe` message or the `subscriptions` of an event stream. */
export type SubscriptionRequest = {
  /** The ID of the subscription, chosen by the client and unique on its connection */
  id: string;
  /** The channel, i.e. `order.shipped`, `resource:Order` or `resource:Order.update` */
  channel: string;
  /** The parameters of a channel */
  params?: Record<string, unknown>;
  /** The query filter the resource of a resource event must match, i.e. `{ status: 'open' }` */
  filter?: Record<string, unknown>;
  /** The key of a stream, i.e. a chat room, `''` by default */
  key?: string;
  /** The stream of the key to resume, from a sequence number, after a reconnection */
  resume?: { streamId: string; seq: number };
};

/** A message of a client on the WebSocket. */
export type RealtimeClientMessage =
  | ({ type: 'subscribe' } & SubscriptionRequest)
  | { type: 'unsubscribe'; id: string }
  | { type: 'action'; action: string; id?: string; payload?: unknown }
  | { type: 'cancel'; id: string }
  | { type: 'resume'; id: string; streamId: string; seq: number }
  | { type: 'ping'; id?: string };

/** A message of the server, on the WebSocket or as the data of an event of an event stream. */
export type RealtimeServerMessage =
  | {
      type: 'welcome';
      connectionId: string;
      expiresAt: string | null;
      heartbeat: number;
    }
  | { type: 'subscribed'; id: string }
  | { type: 'unsubscribed'; id: string }
  | {
      type: 'event';
      id: string;
      channel: string;
      eventId: string;
      data: unknown;
    }
  | { type: 'result'; id: string; result: unknown }
  | { type: 'error'; id?: string; error: ProblemDetails }
  | { type: 'pong'; id?: string }
  | { type: 'reauth' }
  | {
      type: 'stream.start';
      id: string;
      sid: number;
      streamId: string;
      stream: string;
      key: string;
      codec: StreamCodec;
      mimeType?: string;
      seq: number;
    }
  | { type: 'stream.gap'; sid: number; from: number; to: number }
  | StreamFrameMessage;

/** The data of the event of a `resource:` channel. */
export type ResourceEventMessage<T = unknown> = ResourceEvent<T> & {
  /** The name of the model */
  model: string;
};

/** The close codes of a WebSocket connection. */
export enum RealtimeCloseCode {
  /** The server shuts down */
  GoingAway = 1001,
  /** A message breaks the protocol */
  PolicyViolation = 1008,
  /** The authentication of the connection expired, the client reconnects with a new ticket */
  Reauthenticate = 4401,
  /** The ticket is missing or invalid */
  Unauthorized = 4403,
  /** The connection limit of the instance or the user is reached */
  TooManyConnections = 4429,
  /** The client reads its messages too slowly */
  TooSlow = 4408
}
