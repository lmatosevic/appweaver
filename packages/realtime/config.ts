import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const realtimeConfig = defineConfig('realtime', {
  /** Enable the realtime routes: the tickets, the event streams, the WebSocket and the actions. Default: `true`. */
  ENABLED: Type.Boolean({ default: true }),
  /** Prefix of the realtime routes, under the API prefix. Default: `'/realtime'`. */
  ROUTE_PREFIX: Type.String({ default: '/realtime' }),
  /** Enable the Server-Sent Events transport (`GET <prefix>/events`). Default: `true`. */
  SSE_ENABLED: Type.Boolean({ default: true }),
  /** Enable the WebSocket transport (`GET <prefix>/ws`). Default: `true`. */
  WEBSOCKET_ENABLED: Type.Boolean({ default: true }),
  /** Allow the anonymous clients: the connections without a ticket, which subscribe to the public channels and call
   * the public actions only, and the calls of the public actions over HTTP without credentials. Default: `false`. */
  ANONYMOUS_ENABLED: Type.Boolean({ default: false }),
  /** Milliseconds a connection ticket is valid for, used once. Default: `30000` (30 sec). */
  TICKET_TTL: Type.Integer({ default: 30000, minimum: 1000 }),
  /** Milliseconds between the heartbeats of a connection, a WebSocket ping or an SSE comment. Default: `25000`. */
  HEARTBEAT_INTERVAL: Type.Integer({ default: 25000, minimum: 1000 }),
  /** Milliseconds a connection stays open before the client has to reconnect with a new ticket, closed earlier when
   * the token it was opened with expires, `0` for no limit. Default: `3600000` (1 hour). */
  CONNECTION_MAX_AGE: Type.Integer({ default: 3600000, minimum: 0 }),
  /** Maximum number of open connections of the instance, `0` for no limit. Default: `10000`. */
  MAX_CONNECTIONS: Type.Integer({ default: 10000, minimum: 0 }),
  /** Maximum number of open connections of a user on the instance, `0` for no limit. Default: `10`. */
  MAX_CONNECTIONS_PER_USER: Type.Integer({ default: 10, minimum: 0 }),
  /** Maximum number of open anonymous connections of an IP address on the instance, `0` for no limit. Default:
   * `10`. */
  MAX_ANONYMOUS_CONNECTIONS_PER_IP: Type.Integer({ default: 10, minimum: 0 }),
  /** Maximum number of subscriptions of a connection. Default: `50`. */
  MAX_SUBSCRIPTIONS: Type.Integer({ default: 50, minimum: 1 }),
  /** Maximum size of a WebSocket message of a client. Default: `64KB`. */
  MAX_MESSAGE_SIZE: Type.String({ default: '64KB' }),
  /** Bytes a connection may have waiting to be sent before it is closed as too slow. Default: `1MB`. */
  SEND_BUFFER_LIMIT: Type.String({ default: '1MB' }),
  /** Maximum number of WebSocket messages a client sends per second, `0` for no limit. Default: `20`. */
  MESSAGE_RATE_LIMIT: Type.Integer({ default: 20, minimum: 0 }),
  /** Bytes of the last chunks a stream keeps for the subscribers joining late or resuming, unless the stream sets its
   * own `replay.maxBytes`. Default: `256KB`. */
  STREAM_REPLAY_LIMIT: Type.String({ default: '256KB' }),
  /** Bytes a subscriber of a stream may have waiting to be sent before `ready` of the writer waits, pausing the
   * producer, i.e. the generator of a streaming action. Default: `64KB`. */
  STREAM_HIGH_WATER_MARK: Type.String({ default: '64KB' }),
  /** Milliseconds an ended stream, or a streaming action whose client disconnected, stays resumable. Default:
   * `10000` (10 sec). */
  STREAM_LINGER: Type.Integer({ default: 10000, minimum: 0 }),
  /** Milliseconds the chunks of a stream are batched for before they are relayed to the other instances. Default:
   * `20`. */
  STREAM_RELAY_FLUSH_INTERVAL: Type.Integer({ default: 20, minimum: 0 }),
  /** Bytes of chunks relayed to the other instances in one message at most, sent before the flush interval once
   * reached. Default: `64KB`. */
  STREAM_RELAY_MAX_BATCH: Type.String({ default: '64KB' }),
  /** Milliseconds between the messages keeping the relay of the streams between the instances alive, a relayed
   * stream silent for three of them being lost. Default: `5000` (5 sec). */
  STREAM_RELAY_HEARTBEAT: Type.Integer({ default: 5000, minimum: 100 }),
  /** Bytes a client may stream to an action ahead of its handler reading them, given back as the handler reads.
   * Default: `256KB`. */
  STREAM_INPUT_WINDOW: Type.String({ default: '256KB' }),
  /** Bytes a client may stream to an action in all, unless the action sets its own `input.maxBytes`. Default:
   * `10MB`. */
  STREAM_INPUT_MAX_BYTES: Type.String({ default: '10MB' }),
  /** Milliseconds a shutting down instance waits for its calls to end, i.e. the answers of an LLM, after moving its
   * clients to the other instances (close code `1012`), `0` to end them at once. Default: `30000` (30 sec). */
  SHUTDOWN_GRACE_PERIOD: Type.Integer({ default: 30000, minimum: 0 })
});
