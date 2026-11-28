# Realtime

The `@appweaver/realtime` module (`weaver module add realtime`, requires `web`) pushes events to the clients over a
WebSocket or Server-Sent Events (SSE), and lets them call custom actions. A client subscribes to the **channels** of
`createChannel` and to the **resource events** (`create`, `update`, `delete`) of the models exposing them. Nothing is
exposed unless declared, and every event is checked against the access of the subscribed user before it is sent.

The **streams** carry chunks rather than events: the tokens of an LLM answer, the bytes of a radio station, the frames of
a video. A subscriber is checked once when it subscribes, never per chunk, so they cost no access check and, on this
instance, no pub/sub round trip per chunk. See [Streams](#streams).

Every message goes through the `PubSub` contract of core: `memory` in the process, or `redis` (`@appweaver/redis`,
selected by `auto`) to the connections of every instance. The `Events` stay in the process, so the server-side
listeners still run once. The messages are JSON: the callbacks and the clients receive the dates as ISO strings.

## Channels

```ts
// src/realtime/index.ts (an application file, loaded at startup; a module creates its channels in its `main` part)
import { Type } from '@sinclair/typebox';
import { createChannel } from '@appweaver/realtime';

export const orderShipped = createChannel({
  name: 'order.shipped',
  payload: Type.Object({
    orderId: Type.Integer(),
    customerId: Type.Integer(),
    carrier: Type.String()
  }),
  params: Type.Object({ orderId: Type.Optional(Type.Integer()) }),
  roles: ['customer', 'admin'],
  subscribe: (user, params) => true, // once, when the client subscribes
  deliver: (
    user,
    payload,
    params // for every payload and subscription
  ) =>
    payload.customerId === user?.id &&
    (!params.orderId || params.orderId === payload.orderId)
});

await orderShipped.publish({ orderId: 7, customerId: 1, carrier: 'DHL' }); // validated against `payload`
```

| Option                           | Description                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `name`                           | `[a-zA-Z0-9][\w.:-]*`, unique, never starting with `resource:`                            |
| `payload`, `params`              | TypeBox schemas of the payloads and of the subscription parameters                        |
| `public`, `roles`, `permissions` | Who may subscribe, see [Access](#access)                                                  |
| `subscribe`, `deliver`           | Return false to deny the subscription, or to keep a payload from it. They run as the user |
| `description`                    | Description in the OpenAPI document                                                       |

The payloads and parameters of the channels and the payloads of the actions are validated with TypeBox, failing with
`REALTIME_PAYLOAD_INVALID`. The string formats work as on the HTTP routes (`date-time`, `date`, `time`, `email`, `uri`,
`uuid`, `ipv4`, `ipv6`, `hostname`), registered by `registerSchemaFormats` of `@appweaver/common` unless the
application registered its own in the `FormatRegistry` of TypeBox:

```ts
payload: Type.Object({
  text: Type.String(),
  sentAt: Type.String({ format: 'date-time' })
});
```

## Resource events

```ts
createRoutes({
  modelName: 'product',
  events: {
    actions: [
      'create', // the access of the events: roles ['staff']
      { action: 'update', public: true }, // an access of its own, replacing it
      { action: 'delete', roles: ['admin'] }
    ],
    roles: ['staff']
  }
});
```

An action takes the access (`public`, `roles`, `permissions`) of its object, else of the `events`, else of the `find`
route (its own config or the `defaults` of the routes, excluded or not): an event delivers a record, so by default the
users reading it through the API receive it, while the write routes keep their own access.

The model exposes `resource:Product` (every action the user has the access of, refused when none) and
`resource:Product.<action>`. The event data is `{ model, action, current, previous? }`, the records the service
returned to the request (the same virtual field values, relation counts and hidden soft deleted relations), without
the hidden fields or anything the `find` response schema does not declare, relations included. A subscription `filter` in the query filter syntax of the routes (`{ status: 'open', total: { _gt: 100 } }`)
is matched against the scalar fields of `current`; a relation filter matches nothing.

### The `events` policy

Before an event reaches a user, `ResourceService.checkEventAccess` runs as that user (`null` when anonymous):

1. the `events` callback of the policy decides alone, when defined;
2. otherwise the `checkAccess` of a `find` must pass, and the record must match the `readRestrictions` of the `find`,
   matched in memory (`AND`, `OR`, `NOT`, `equals`, `not`, `in`, `notIn`, `lt`, `lte`, `gt`, `gte`, `contains`,
   `startsWith`, `endsWith`, `mode`), or by a `count` of the database when they filter by a relation. A deleted record
   only the database can match is denied.

```ts
createPolicy({
  modelName: 'order',
  events: (user, { action, current, previous }) =>
    (!!user && hasRole(user, 'admin')) || current.customerId === user?.id
});
```

The access is checked once per event and user, on every instance holding a connection of the user. A service of
`createService` overrides `eventAccess(event)` for the same. The records of the pub/sub messages hold the hidden
fields, so the Redis server must be as private as the database.

> **Known limitation: relation restrictions cost a query per user and event.** Without an `events` callback, a model
> whose `readRestrictions` filter by a relation (`{ team: { members: { some: { userId } } } }`) is checked with one
> `count` of the database for every event and every distinct subscribed user: 1,000 users on `resource:Post` and 50
> post updates a second make 50,000 queries a second. The number of connections of a user does not matter, the number
> of users does. A busy model with such restrictions defines the `events` callback, checked in memory:
>
> ```ts
> createPolicy({
>   modelName: 'post',
>   readRestrictions: (user) => ({
>     team: { members: { some: { userId: user?.id } } }
>   }),
>   events: (user, { current }) =>
>     !!user && userTeamIds(user).includes(current.teamId)
> });
> ```

## Actions

Custom operations only: CRUD keeps its routes, validation and policies.

```ts
createRealtimeAction({
  name: 'chat.typing',
  payload: Type.Object({ roomId: Type.Integer() }),
  response: Type.Object({ seen: Type.Integer() }),
  roles: ['user'],
  handler: async ({ roomId }, { user, transport, connectionId, ack }) => ({
    seen: 3
  }) // runs as the user
});
```

A call with an `id` waits for its `result` or `error`; one without is fire-and-forget, its errors only logged at
`debug`, for data whose loss is harmless (a cursor, a typing indicator). Over HTTP, `?ack=false` answers 202 at once.

## Streams

A stream is an ordered flow of chunks from one producer to one or many connections: `text` (strings), `json` (JSON
values) or `binary` (bytes, sent as base64 in the JSON frames). Where a channel checks `deliver` and publishes to the
pub/sub for every payload, a stream:

- checks a subscriber once, when it subscribes (`public`, `roles`, `permissions`, `subscribe`), and again only when the
  user changes, like a channel;
- encodes a chunk once, however many subscribers receive it, and writes it to their connections directly;
- reaches another instance only while one of them has a subscriber of its key, in batches of
  `realtime.streamRelayFlushInterval` milliseconds (or `streamRelayMaxBatch` bytes) over the `PubSub`, so a stream
  without remote subscribers never touches Redis;
- keeps its last chunks (`replay`) for the late subscribers and the ones resuming after a reconnection.

### Streaming actions

The answer of an LLM to the user asking for it: an action with `stream`, whose handler is an async generator. Its
chunks reach the caller only, as they come, and the stream ends with the value it returns:

```ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

createRealtimeAction({
  name: 'assistant.prompt',
  payload: Type.Object({ prompt: Type.String() }),
  response: Type.Object({ stopReason: Type.String() }),
  stream: { codec: 'text', coalesce: 16 }, // merges the tokens of 16 ms into one chunk
  async *handler({ prompt }, { user, signal }) {
    const stream = anthropic.messages.stream(
      {
        model: process.env.ANTHROPIC_MODEL!,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      },
      { signal }
    );
    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
    return {
      stopReason: (await stream.finalMessage()).stop_reason ?? 'end_turn'
    };
  }
});
```

- The handler runs as the user, like any action. A handler returning a value instead of an async iterable ends the
  stream with it, and an error ends it with its problem details.
- The generator is pulled only while the caller reads fast enough (`realtime.streamHighWaterMark`), so a slow client
  pauses the producer instead of buffering the whole answer.
- `signal` aborts once the client cancels the call, once it disconnects and does not resume within
  `realtime.streamLinger` milliseconds, or once the instance shuts down: pass it to the LLM SDK so the generation stops.
- Over the WebSocket the call needs an `id` (a fire-and-forget call is refused) and is answered by the stream instead of
  a `result`. Over HTTP, `POST <api>/realtime/actions/:name` with `Accept: text/event-stream` answers with the
  Server-Sent Events of the stream (`406 REALTIME_STREAM_ACCEPT` without it, `400` with `ack=false`), cancelled when
  the client leaves.
- A client losing its WebSocket resumes the call on its next connection, on the same instance, from the last chunk it
  received (`{ type: 'resume', id, streamId, seq }`), while the stream lingers. Another user is refused with
  `REALTIME_STREAM_NOT_FOUND`.

### Streams of a key

A stream of many subscribers, i.e. the answer shown to a whole chat room, or a radio station: `createStream`, opened
for a key by its producer, anywhere in the application (a route, an action, a queue job of an instance with the module):

```ts
// src/realtime/index.ts
export const roomAnswer = createStream({
  name: 'room.answer',
  params: Type.Object({ roomId: Type.Integer() }),
  subscribe: (user, { roomId }, key) =>
    key === String(roomId) && isMember(user, roomId) // once per subscription
});

export const radio = createStream({
  name: 'radio.live',
  codec: 'binary',
  mimeType: 'audio/mpeg',
  public: true,
  replay: { from: 'sync', maxBytes: '512KB' }, // a new listener starts at the last frame boundary
  onSlow: 'skip-to-sync' // a slow listener skips to the next frame boundary instead of being closed
});

const writer = roomAnswer.open(String(roomId));
for await (const token of tokens) {
  writer.write(token);
  await writer.ready; // waits while a subscriber of this instance reads too slowly
}
writer.end({ messageId });

radio.open('jazz').write(frame, { sync: true }); // a chunk a listener can start from
```

| Option                           | Description                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `name`                           | `[a-zA-Z0-9][\w.:-]*`, unique, subscribed to as the channel `stream:<name>`                                         |
| `codec`                          | `text` (default), `json` or `binary`                                                                                |
| `mimeType`                       | The media type of a `binary` stream, told to the clients                                                            |
| `chunk`                          | The TypeBox schema of the chunks of a `json` stream, checked outside of `prod`                                      |
| `params`                         | The TypeBox schema of the subscription parameters                                                                   |
| `public`, `roles`, `permissions` | Who may subscribe, see [Access](#access)                                                                            |
| `resource`                       | `{ model, id? }`: the record of a key, a subscriber must be able to `find` it, see [Access](#access-of-the-streams) |
| `subscribe`                      | `(user, params, key)`, false denies the subscription; it runs as the user                                           |
| `replay`                         | `{ from, maxBytes }`: `all` the chunks kept (default), from the last `sync` one, or `none`; the bytes kept          |
| `onSlow`                         | A subscriber over `realtime.sendBufferLimit`: `close` (default), `drop` its chunks, or `skip-to-sync`               |
| `coalesce`                       | Milliseconds the `text` or `binary` chunks are merged for, `0` (default) for none                                   |
| `description`                    | Description in the OpenAPI document                                                                                 |

The streaming actions take the same `codec`, `mimeType`, `chunk`, `replay`, `onSlow` and `coalesce` in their `stream`.

The writer of `open(key)` has `write(chunk, { sync? })`, `end(result?)`, `error(error)`, `ready`, `signal` (aborted
once ended or on shutdown), `ended`, `streamId` and `subscribers` (the subscribers of this instance and the instances
relaying it). A subscription to a key receives every stream opened for it, several at once each with an ID of its own,
and stays until it is removed. A missed chunk (a slow subscriber, a reconnection beyond the replay) is announced with a
`stream.gap` before the next one. A relayed stream whose owner instance goes silent for three
`realtime.streamRelayHeartbeat` ends with `REALTIME_STREAM_LOST`, and so do the streams of an instance shutting down.

### Inputs

The other direction: the chunks a client streams to an action, i.e. the audio of a microphone for a speech to text
model, read by the handler as `context.input`, an async iterable ending when the client ends it. An action with an
`input` and a `stream` is duplex (audio in, text out); one with an `input` alone answers with the value it returns:

```ts
createRealtimeAction({
  name: 'voice.transcribe',
  payload: Type.Object({ language: Type.String() }),
  input: { codec: 'binary', mimeType: 'audio/webm', maxBytes: '50MB' },
  stream: { codec: 'text' },
  async *handler({ language }, { input, signal }) {
    yield* stt.transcribe(input!, { language, signal });
  }
});

// The input of one user passed on to the subscribers of a stream (a user broadcasting)
createRealtimeAction({
  name: 'radio.broadcast',
  payload: Type.Object({ station: Type.String() }),
  roles: ['host'],
  input: { codec: 'binary', mimeType: 'audio/mpeg', maxBytes: '1GB' },
  async handler({ station }, { input }) {
    const writer = radio.open(station);
    try {
      for await (const frame of input!) {
        writer.write(frame);
        await writer.ready;
      }
      writer.end();
    } catch (e) {
      writer.error(e); // the call was cancelled, the host disconnected or lost the access
    }
  }
});
```

| Option     | Description                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| `codec`    | `text` (default), `json` or `binary` (`Uint8Array` chunks)                                                   |
| `mimeType` | The media type of a `binary` input, told to the clients                                                      |
| `chunk`    | The TypeBox schema of the chunks of a `json` input, checked in every environment                             |
| `maxBytes` | The bytes the client may send in all, `realtime.streamInputMaxBytes` by default (`413 REALTIME_INPUT_LIMIT`) |

- An input is sent over the WebSocket only: over HTTP the call fails with `REALTIME_MESSAGE_INVALID`.
- The access of the action is checked once when the call starts. The chunks pass no rate limit and no access check;
  they are paced by credits instead: the client sends at most `realtime.streamInputWindow` bytes ahead of the handler
  reading them, given back by `input.credit` messages as it reads, so a slow handler slows the client down instead of
  filling the memory of the server. A client sending beyond its window fails the call (`REALTIME_MESSAGE_INVALID`).
  An input of no call receiving one (i.e. a call that just ended) is answered with a `REALTIME_MESSAGE_INVALID` error
  of its ID, and counts against `realtime.messageRateLimit`.
- A binary chunk is a binary WebSocket message, not base64: the byte `1`, the length of the ID of the call, the ID,
  then the bytes. Any other binary message closes the connection with `1008`.
- The connection lost while the input is open cancels the call: an input never resumes, the client calls again. Once
  the client ended its input, the stream of a duplex call resumes like any streaming action.
- `signal` aborts once the call is cancelled, its connection lost, its user losing the access, or the instance shutting
  down, and the iteration of `input` throws (an `AbortError`, or the error of the call).

### Costs

| Per chunk      | Streams                                                                    |
| -------------- | -------------------------------------------------------------------------- |
| Access checks  | None (once per subscription)                                               |
| Encoding       | One `JSON.stringify`, shared by every subscriber                           |
| Pub/sub, Redis | None locally; one publish per batch only while another instance subscribes |
| Validation     | The codec; the `chunk` schema of `json`, of a stream outside of `prod`     |

The cost that remains is one message per subscriber per chunk on its socket: `coalesce` lowers it for the token
streams, whose tokens arrive faster than a user reads them.

## Access

Every part is private by default: a subscription or a call needs a user. `public`, `roles` and `permissions` on a
channel, an action, the `events` of a model or one of its actions set who may use it (`roles` and `permissions` ignored
on a public part). The anonymous clients use the public parts once `realtime.anonymousEnabled` is set:

```jsonc
// appweaver.json, or REALTIME_ANONYMOUS_ENABLED=true and REALTIME_MAX_ANONYMOUS_CONNECTIONS_PER_IP=5
{
  "config": {
    "realtime": { "anonymousEnabled": true, "maxAnonymousConnectionsPerIp": 5 }
  }
}
```

```ts
export const stockPrice = createChannel({
  name: 'stock.price',
  public: true,
  payload: Type.Object({ symbol: Type.String(), price: Type.Number() }),
  params: Type.Object({ symbol: Type.Optional(Type.String()) }),
  deliver: (_, payload, params) =>
    !params.symbol || params.symbol === payload.symbol
});
```

A public channel without `deliver` sends every payload to everyone. The HTTP actions route authenticates a request
carrying credentials (an invalid one fails with `401`), and runs one without as anonymous.

### Access of the streams

Every check of a stream runs once, when a client subscribes, and again when its user changes, never per chunk:

1. the module: `realtime.anonymousEnabled` for the clients without a ticket;
2. the declaration: `public`, `roles` and `permissions` (the `hasRoles` and `hasPermissions` of the auth model);
3. the policy of a resource: with `resource`, the subscriber must be able to `find` the record of the key, as
   themselves, so the `checkAccess` and the `readRestrictions` of the `createPolicy` of its model decide, the same
   rules as the routes of the model. The ID is the key (a number for a key of digits), or `id(key, params)`;
4. the `subscribe` callback of the stream, for any other rule.

```ts
createPolicy({
  modelName: 'chatRoom',
  readRestrictions: (user) => ({ members: { some: { userId: user?.id } } })
});

export const roomAnswer = createStream({
  name: 'room.answer',
  resource: { model: 'ChatRoom' }
});
// subscribe to 'stream:room.answer' with key '42': allowed while the user can read the room 42
```

The access of the producer is the one of the code opening the stream: an action (its `public`, `roles` and
`permissions`, the policies of the resources it uses as the user), a route, a job. A change the policy depends on but
the user does not (a member removed from a room) applies at the next subscription, or at once with
`inject(RealtimeGateway).refresh(userId)`, which checks the subscriptions of the user again.

### Logout, disabling and role changes

A change of a user reaches their connections and their calls on every instance, over the WebSocket and HTTP alike:

| Change                                 | Subscriptions to streams                           | Calls (streaming actions, inputs)                                        |
| -------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| Logout (`logoutAt`, a password change) | Their connections closed (`4401`), no reconnection | Ended at once with `REALTIME_ACTION_DENIED`, never left to linger        |
| Disabling, deletion                    | The same                                           | The same                                                                 |
| Other roles or permissions             | Checked again, the lost ones removed with an error | Ended with `REALTIME_ACTION_DENIED` when the action is no longer allowed |
| `revoke(userId)`, `refresh(userId)`    | The same as a logout, or as other roles            | The same                                                                 |

Ending a call aborts its `signal` and fails its `input`, so the generation of an LLM or the reading of an input stops;
`inject(RealtimeGateway).calls` lists the calls running on the instance.

## Rolling updates

A deployment replacing the instances one by one keeps the streams of the clients running. On `SIGTERM` (`app.stop()`)
the readiness answers `503`, then the realtime part of the instance drains before the server closes:

1. it refuses the new connections (a WebSocket closed with `1012`, an event stream answered `503`) and the new calls
   with a stream or an input (`503 REALTIME_SHUTTING_DOWN`);
2. it closes its connections with `1012` (Service Restart), except the ones streaming an input not ended yet, which
   cannot move. The clients reconnect at once to another instance, each after a random part of `reconnectDelay` so
   they do not all arrive together, with their subscriptions;
3. a client resuming a streaming action on the new instance (`{ type: 'resume', id, streamId, seq }`) receives it
   relayed from the draining instance, which keeps generating it, checked as the same user. Cancelling it on the new
   instance cancels it on the owner;
4. it waits for its calls to end, the ones over HTTP too, at most `realtime.shutdownGracePeriod` milliseconds
   (`30000`), ends the rest with `REALTIME_SHUTTING_DOWN`, and closes what remains with `1001`.

| Part                                 | On a rolling update                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Channels, resource events            | Subscribed again on another instance; the events published during the reconnection are lost                                                                              |
| Streams of a key (`createStream`)    | Subscribed again, a stream of a surviving instance resumed from its last chunk; the producer of a stream on the stopping instance stops with it (`REALTIME_STREAM_LOST`) |
| Streaming actions over the WebSocket | Resumed on another instance, relayed from the draining one until they end, within the grace period                                                                       |
| Streaming actions over HTTP          | Kept on their connection until they end, within the grace period                                                                                                         |
| Inputs                               | Their connection kept until the client ends the input, within the grace period                                                                                           |

Set the termination grace period of the platform (`terminationGracePeriodSeconds` of Kubernetes) above
`realtime.shutdownGracePeriod`, and the generations to fit in it. A crash or a kill loses the calls of the instance:
the clients get `REALTIME_STREAM_NOT_FOUND` when resuming, and call again. The tickets and the relay between the
instances need the `redis` providers of `Memory` and `PubSub`.

## Connections

A browser cannot send the `Authorization` header with an `EventSource` or a `WebSocket`, so the client asks for a ticket
with its credentials, used once and valid `realtime.ticketTtl` milliseconds on every instance (kept in the `Memory`,
with the user but never their password hash). The user is loaded again when the ticket is redeemed, refused once
deleted, disabled or logged out since.

| Route                                              | Description                                                                                                    |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST <api>/realtime/ticket`                       | `{ ticket, expiresIn }`, any authentication                                                                    |
| `GET <api>/realtime/ws?ticket=`                    | The WebSocket, described by the `x-appweaver-realtime` extension                                               |
| `GET <api>/realtime/events?ticket=&subscriptions=` | The SSE stream of the subscriptions of the query, a JSON array; a change reopens it                            |
| `POST <api>/realtime/actions/:name?ack=`           | Calls an action, answers `{ result }`, or 202 with `ack=false`; a streaming action answers with its SSE stream |

A connection without a ticket is anonymous, or refused (`REALTIME_TICKET_INVALID`). It closes with a `reauth` message
and the code `4401` when the token of its ticket expires or after `realtime.connectionMaxAge`, and the client
reconnects with a new ticket. A disabled transport (`realtime.sseEnabled`, `realtime.websocketEnabled`) answers its
route with `404 REALTIME_TRANSPORT_DISABLED`, and is left out of the `transports` of the extension. Delivery is
at-most-once: an event published while a client reconnects is lost.

A change of a user of the auth model reaches their connections on every instance. A logout (a new `logoutAt`, also
set by a password change), a disabling or a deletion closes them the same way, and the client fails to reconnect. Any
other change, i.e. other roles, loads the user of the connections again from the database: the checks of the next
events use it, and the subscriptions the user lost are removed, each answered with a `REALTIME_SUBSCRIPTION_DENIED`
error. A change the auth model does not see, i.e. the permissions of a role, applies at the next reconnection, or with
`inject(RealtimeGateway).refresh(userId)`; `revoke(userId)` closes the connections.

### Protocol

Every message is a JSON object: a WebSocket text frame, or the `data` of an SSE event whose `id` is the `eventId`.

| Client → server (WebSocket)                                                   | Answer                                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `{ type: 'subscribe', id, channel, params?, filter? }`                        | `{ type: 'subscribed', id }`                                       |
| `{ type: 'subscribe', id, channel: 'stream:<name>', key?, params?, resume? }` | `{ type: 'subscribed', id }`, then the streams                     |
| `{ type: 'unsubscribe', id }`                                                 | `{ type: 'unsubscribed', id }`                                     |
| `{ type: 'action', id, action, payload }`                                     | `{ type: 'result', id, result }`, the stream of a streaming action |
| `{ type: 'action', action, payload }`                                         | nothing (fire-and-forget)                                          |
| `{ type: 'cancel', id }`                                                      | `stream.end` with `cancelled`                                      |
| `{ type: 'input', id, data }`, or a binary message                            | `{ type: 'input.credit', id, bytes }` as the handler reads         |
| `{ type: 'input.end', id }`                                                   | The result, or the end of the stream                               |
| `{ type: 'resume', id, streamId, seq }`                                       | The stream of a call, from `seq`                                   |
| `{ type: 'ping', id? }`                                                       | `{ type: 'pong', id? }`                                            |

The server sends `{ type: 'welcome', connectionId, expiresAt, heartbeat }` once open, `{ type: 'event', id, channel,
eventId, data }` for the subscription `id` (chosen by the client, `[\w.:-]{1,64}`), `{ type: 'error', id?, error }` with
the problem details of a failed message, and `{ type: 'reauth' }` before `4401`. The subscriptions change in the order
of the messages; the actions run at once.

A stream starts with `{ type: 'stream.start', id, sid, streamId, stream, key, codec, mimeType?, seq }` for the
subscription or the call `id`. Its frames name it by `sid`, the ID of the stream on the connection, so every subscriber
receives the same encoded frame: `{ type: 'chunk', sid, seq, data, sync? }` (`data` in base64 for `binary`),
`{ type: 'stream.gap', sid, from, to }`, then `{ type: 'stream.end', sid, seq, result?, cancelled? }` or
`{ type: 'stream.error', sid, seq, error }`. A subscription resumes a stream of its key with
`resume: { streamId, seq }`, from the chunks kept.

| Close code | Meaning                                          |
| ---------- | ------------------------------------------------ |
| `1001`     | The server shuts down                            |
| `1012`     | The server restarts, reconnect at once elsewhere |
| `1008`     | A binary message                                 |
| `4401`     | The authentication expired                       |
| `4403`     | The ticket is missing or invalid                 |
| `4408`     | The client reads too slowly                      |
| `4429`     | Too many connections of the instance, user or IP |

## Client

The generated client has `client.realtime`, typed by the channels, resources and actions of the server:

```ts
const client = createClient({
  baseUrl: 'https://api.example.com',
  auth: { jwt: () => session.accessToken },
  realtime: { anonymous: 'auto' } // anonymous until the login
});

client.realtime.subscribe('stock.price', show, { symbol: 'AAPL' });
client.realtime.on('Product', ({ action, current }) => refresh(current), {
  action: 'update'
});
await client.realtime.send('chat.typing', { roomId: 1 });
client.realtime.emit('cursor.move', { x: 10, y: 20 });

const call = client.realtime.call('assistant.prompt', { prompt }); // a streaming action
for await (const token of call) output += token;
const { stopReason } = await call.result;

const voice = client.realtime.call(
  'voice.transcribe',
  { language: 'en' },
  { input: microphoneChunks }
); // an input
for await (const text of voice) showCaption(text);

client.realtime.stream(
  'room.answer',
  {
    onStart: ({ streamId }) => startMessage(streamId),
    onChunk: (token, { streamId }) => append(streamId, token),
    onEnd: (result, { streamId }) => finishMessage(streamId)
  },
  { key: '42', params: { roomId: 42 } }
);

await login();
await client.realtime.reconnect(); // the connection of the user, with the subscriptions
```

See [client.md](./client.md#realtime-client) for the methods and the options.

## Config, errors, telemetry, testing

- Config: `realtime.*` (`REALTIME_*`) and `pubsub.*` (`PUBSUB_*`), see
  [configuration.md](./configuration.md#realtime-realtime_).
- Errors: the `REALTIME_*` codes of [errors.md](./errors.md#error-codes).
- Telemetry (`telemetry.instrumentations.realtime`): the span `realtime action <name>` (until the end of the stream of
  a streaming action), the span `realtime stream <name>` of a stream opened on the instance, the metrics
  `appweaver.realtime.connections`, `appweaver.realtime.events` (`delivered`, `denied`, `dropped`, a dropped chunk
  counted as `stream:<name>`), `appweaver.realtime.messages`, `appweaver.realtime.streams`,
  `appweaver.realtime.stream.chunks`, `appweaver.realtime.stream.bytes` and `appweaver.realtime.input.bytes`.
- Testing: connect with the global `WebSocket` and `fetch` of Node after a `POST <api>/realtime/ticket`, define
  `MemoryPubSub` of `@appweaver/core/drivers` in a unit test, and test a `PubSub` driver with `testPubSubContract`.
