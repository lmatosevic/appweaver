# Realtime

The `@appweaver/realtime` module (`weaver module add realtime`, requires `web`) pushes events to the clients over a
WebSocket or Server-Sent Events (SSE), and lets them call custom actions. A client subscribes to the **channels** of
`createChannel` and to the **resource events** (`create`, `update`, `delete`) of the models exposing them. Nothing is
exposed unless declared, and every event is checked against the access of the subscribed user before it is sent.

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
  payload: Type.Object({ orderId: Type.Integer(), customerId: Type.Integer(), carrier: Type.String() }),
  params: Type.Object({ orderId: Type.Optional(Type.Integer()) }),
  roles: ['customer', 'admin'],
  subscribe: (user, params) => true, // once, when the client subscribes
  deliver: (user, payload, params) => // for every payload and subscription
    payload.customerId === user?.id && (!params.orderId || params.orderId === payload.orderId)
});

await orderShipped.publish({ orderId: 7, customerId: 1, carrier: 'DHL' }); // validated against `payload`
```

| Option                           | Description                                                                                 |
|----------------------------------|---------------------------------------------------------------------------------------------|
| `name`                           | `[a-zA-Z0-9][\w.:-]*`, unique, never starting with `resource:`                              |
| `payload`, `params`              | TypeBox schemas of the payloads and of the subscription parameters                          |
| `public`, `roles`, `permissions` | Who may subscribe, see [Access](#access)                                                    |
| `subscribe`, `deliver`           | Return false to deny the subscription, or to keep a payload from it. They run as the user   |
| `description`                    | Description in the OpenAPI document                                                         |

The payloads and parameters of the channels and the payloads of the actions are validated with TypeBox, failing with
`REALTIME_PAYLOAD_INVALID`. The string formats work as on the HTTP routes (`date-time`, `date`, `time`, `email`, `uri`,
`uuid`, `ipv4`, `ipv6`, `hostname`), registered by `registerSchemaFormats` of `@appweaver/common` unless the
application registered its own in the `FormatRegistry` of TypeBox:

```ts
payload: Type.Object({ text: Type.String(), sentAt: Type.String({ format: 'date-time' }) })
```

## Resource events

```ts
createRoutes({
  modelName: 'product',
  events: {
    actions: [
      'create',                              // the access of the events: roles ['staff']
      { action: 'update', public: true },    // an access of its own, replacing it
      { action: 'delete', roles: ['admin'] }
    ],
    roles: ['staff']
  }
});
```

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
  events: (user, { action, current, previous }) => (!!user && hasRole(user, 'admin')) || current.customerId === user?.id
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
>   readRestrictions: (user) => ({ team: { members: { some: { userId: user?.id } } } }),
>   events: (user, { current }) => !!user && userTeamIds(user).includes(current.teamId)
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
  handler: async ({ roomId }, { user, transport, connectionId, ack }) => ({ seen: 3 }) // runs as the user
});
```

A call with an `id` waits for its `result` or `error`; one without is fire-and-forget, its errors only logged at
`debug`, for data whose loss is harmless (a cursor, a typing indicator). Over HTTP, `?ack=false` answers 202 at once.

## Access

Every part is private by default: a subscription or a call needs a user. `public`, `roles` and `permissions` on a
channel, an action, the `events` of a model or one of its actions set who may use it (`roles` and `permissions` ignored
on a public part). The anonymous clients use the public parts once `realtime.anonymousEnabled` is set:

```jsonc
// appweaver.json, or REALTIME_ANONYMOUS_ENABLED=true and REALTIME_MAX_ANONYMOUS_CONNECTIONS_PER_IP=5
{ "config": { "realtime": { "anonymousEnabled": true, "maxAnonymousConnectionsPerIp": 5 } } }
```

```ts
export const stockPrice = createChannel({
  name: 'stock.price',
  public: true,
  payload: Type.Object({ symbol: Type.String(), price: Type.Number() }),
  params: Type.Object({ symbol: Type.Optional(Type.String()) }),
  deliver: (_, payload, params) => !params.symbol || params.symbol === payload.symbol
});
```

A public channel without `deliver` sends every payload to everyone. The HTTP actions route authenticates a request
carrying credentials (an invalid one fails with `401`), and runs one without as anonymous.

## Connections

A browser cannot send the `Authorization` header with an `EventSource` or a `WebSocket`, so the client asks for a ticket
with its credentials, used once and valid `realtime.ticketTtl` milliseconds on every instance (kept in the `Memory`,
with the user but never their password hash). The user is loaded again when the ticket is redeemed, refused once
deleted, disabled or logged out since.

| Route                                              | Description                                                                          |
|----------------------------------------------------|--------------------------------------------------------------------------------------|
| `POST <api>/realtime/ticket`                       | `{ ticket, expiresIn }`, any authentication                                          |
| `GET <api>/realtime/ws?ticket=`                    | The WebSocket, described by the `x-appweaver-realtime` extension                     |
| `GET <api>/realtime/events?ticket=&subscriptions=` | The SSE stream of the subscriptions of the query, a JSON array; a change reopens it  |
| `POST <api>/realtime/actions/:name?ack=`           | Calls an action, answers `{ result }`, or 202 with `ack=false`                       |

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

| Client → server (WebSocket)                            | Answer                           |
|--------------------------------------------------------|----------------------------------|
| `{ type: 'subscribe', id, channel, params?, filter? }` | `{ type: 'subscribed', id }`     |
| `{ type: 'unsubscribe', id }`                          | `{ type: 'unsubscribed', id }`   |
| `{ type: 'action', id, action, payload }`              | `{ type: 'result', id, result }` |
| `{ type: 'action', action, payload }`                  | nothing (fire-and-forget)        |
| `{ type: 'ping', id? }`                                | `{ type: 'pong', id? }`          |

The server sends `{ type: 'welcome', connectionId, expiresAt, heartbeat }` once open, `{ type: 'event', id, channel,
eventId, data }` for the subscription `id` (chosen by the client, `[\w.:-]{1,64}`), `{ type: 'error', id?, error }` with
the problem details of a failed message, and `{ type: 'reauth' }` before `4401`. The subscriptions change in the order
of the messages; the actions run at once.

| Close code | Meaning                                          |
|------------|--------------------------------------------------|
| `1001`     | The server shuts down                            |
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
client.realtime.on('Product', ({ action, current }) => refresh(current), { action: 'update' });
await client.realtime.send('chat.typing', { roomId: 1 });
client.realtime.emit('cursor.move', { x: 10, y: 20 });

await login();
await client.realtime.reconnect(); // the connection of the user, with the subscriptions
```

See [client.md](./client.md#realtime-client) for the methods and the options.

## Config, errors, telemetry, testing

- Config: `realtime.*` (`REALTIME_*`) and `pubsub.*` (`PUBSUB_*`), see
  [configuration.md](./configuration.md#realtime-realtime_).
- Errors: the `REALTIME_*` codes of [errors.md](./errors.md#error-codes).
- Telemetry (`telemetry.instrumentations.realtime`): the span `realtime action <name>`, the metrics
  `appweaver.realtime.connections`, `appweaver.realtime.events` (`delivered`, `denied`, `dropped`) and
  `appweaver.realtime.messages`.
- Testing: connect with the global `WebSocket` and `fetch` of Node after a `POST <api>/realtime/ticket`, define
  `MemoryPubSub` of `@appweaver/core/drivers` in a unit test, and test a `PubSub` driver with `testPubSubContract`.
