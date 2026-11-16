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
  /** Allow the connections without a ticket, which subscribe to the public channels only. Default: `false`. */
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
  /** Maximum number of subscriptions of a connection. Default: `50`. */
  MAX_SUBSCRIPTIONS: Type.Integer({ default: 50, minimum: 1 }),
  /** Maximum size of a WebSocket message of a client. Default: `64KB`. */
  MAX_MESSAGE_SIZE: Type.String({ default: '64KB' }),
  /** Bytes a connection may have waiting to be sent before it is closed as too slow. Default: `1MB`. */
  SEND_BUFFER_LIMIT: Type.String({ default: '1MB' }),
  /** Maximum number of WebSocket messages a client sends per second, `0` for no limit. Default: `20`. */
  MESSAGE_RATE_LIMIT: Type.Integer({ default: 20, minimum: 0 })
});
