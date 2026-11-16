# Realtime

The `@appweaver/realtime` module pushes events to the clients over a WebSocket or a stream of Server-Sent Events
(SSE), and lets the WebSocket clients call custom actions. A client subscribes to:

- **channels** of the application or of a module, created with `createChannel`, publishing a typed payload
- **resource events** of the models exposing them, the `create`, `update` and `delete` of a resource service

Nothing is exposed unless declared: a channel by its `createChannel`, the events of a model by the `events` of its
`createRoutes`. Every event is checked against the access of the subscribed user before it is sent.

```sh
weaver module add realtime   # requires web, uses the Redis pub/sub with the redis module
```

## How it works

```
ResourceService ──emitResourceEvent──▶ Events (in process, after the commit)
                                          │ bridge of the models with `events`
channel.publish() ───────────────────────▶│
                                          ▼
                                   PubSub (memory | redis) ── every instance
                                          ▼
                     RealtimeGateway of each instance: the subscriptions of its connections,
                     the access check of each user, the projection of the records, the send
```

The messages go through the `PubSub` contract of core: `memory` in the process, `redis` (`@appweaver/redis`) to the
connections of every instance. `auto` selects `redis` when the module is enabled. The `Events` stay in the process, so
the server-side listeners still run once.

## Channels

```ts
// src/realtime/index.ts (an application file, loaded at startup)
import { Type } from '@sinclair/typebox';
import { createChannel } from '@appweaver/realtime';

export const orderShipped = createChannel({
  name: 'order.shipped',
  description: 'An order of the customer is shipped',
  payload: Type.Object({ orderId: Type.Integer(), customerId: Type.Integer(), carrier: Type.String() }),
  params: Type.Object({ orderId: Type.Optional(Type.Integer()) }),
  roles: ['customer', 'admin'],
  // Once, when the client subscribes
  subscribe: (user, params) => true,
  // For every payload and subscription
  deliver: (user, payload, params) =>
    payload.customerId === user?.id && (!params.orderId || params.orderId === payload.orderId)
});

// Anywhere in the application, i.e. a service hook or a queue worker
await orderShipped.publish({ orderId: 7, customerId: 1, carrier: 'DHL' });
```

| Option                         | Description                                                                                  |
|--------------------------------|----------------------------------------------------------------------------------------------|
| `name`                         | `[a-zA-Z0-9][\w.:-]*`, never starting with `resource:`, unique                               |
| `payload`                      | TypeBox schema of the payloads, validated by `publish` (`REALTIME_PAYLOAD_INVALID`)          |
| `params`                       | TypeBox schema of the subscription parameters, validated when subscribing                    |
| `public`, `roles`, `permissions` | Who may subscribe: anyone (anonymous connections too, see [Public access](#public-access)), or a user with one of the roles/permissions, otherwise any authenticated user |
| `subscribe(user, params)`      | Returns false to deny the subscription (`REALTIME_SUBSCRIPTION_DENIED`)                       |
| `deliver(user, payload, params)` | Returns false to keep a payload from a subscription                                         |
| `description`                  | Description in the OpenAPI document                                                          |

The callbacks run as the user (`runAs`), so the resource services apply the policies of the user. A module creates its
channels in its `main` or `web` part. The payloads are JSON: a `Date` reaches the client as an ISO string.

## Resource events

```ts
createRoutes({
  modelName: 'order',
  events: { actions: ['create', 'update', 'delete'], roles: ['customer'] }
});
```

The model exposes the channels `resource:Order` (every action listed) and `resource:Order.<action>`. The `events` take
`actions` and the `public`, `roles` and `permissions` of the subscriptions. The event data is:

```ts
{ model: 'Order', action: 'update', current: OrderSingle, previous?: OrderSingle }
```

`current` and `previous` are projected onto the response schema of the `find` route: the virtual fields added, the
hidden fields (`passwordHash`) and anything the schema does not declare left out, relations included.

### The `events` policy

Before an event reaches a user, `ResourceService.checkEventAccess` runs as that user:

1. The `events` callback of the policy, when defined, decides alone.
2. Otherwise the `checkAccess` of a `find` of the resource must pass, and the resource must match the
   `readRestrictions` of the `find`. The restrictions are matched in memory (`AND`, `OR`, `NOT`, `equals`, `not`, `in`,
   `notIn`, `lt`, `lte`, `gt`, `gte`, `contains`, `startsWith`, `endsWith`, `mode: 'insensitive'`), and with one
   `count` of the database when they filter by a relation. A deleted resource whose restrictions only the database can
   match is denied: define the `events` callback for such a model.

```ts
createPolicy({
  modelName: 'order',
  readRestrictions: (user) => (user && hasRole(user, 'admin') ? {} : { customerId: user?.id }),
  // Optional, replacing the default check of the events
  events: (user, { action, current, previous }) => (!!user && hasRole(user, 'admin')) || current.customerId === user?.id
});
```

A service of `createService` overrides `eventAccess(event)` for the same. The access is checked once per event and user,
on every instance holding a connection of the user. The resources of the pub/sub messages are the records of the
service, hidden fields included, so the Redis server must be private.

A subscription can narrow the events with a `filter` in the query filter syntax of the routes
(`{ status: 'open', total: { _gt: 100 } }`), matched in memory against the scalar fields of `current`. A filter on a
relation matches nothing.

## Actions

The clients call the custom actions of the application over the WebSocket, or with `POST <prefix>/actions/<name>`. CRUD
never goes through an action: it keeps its routes, validation and policies.

```ts
import { createRealtimeAction } from '@appweaver/realtime';

createRealtimeAction({
  name: 'chat.typing',
  payload: Type.Object({ roomId: Type.Integer() }),
  response: Type.Object({ seen: Type.Integer() }),
  roles: ['user'],
  handler: async ({ roomId }, { user, transport, connectionId, ack }) => {
    await typing.publish({ roomId, userId: user!.id });
    return { seen: 3 };
  }
});
```

The handler runs as the user of the connection or the request. A call with an `id` waits for the `result` or the
`error`; a call without one is fire-and-forget: nothing answers it, its errors are only logged at `debug`. Use it for
data whose loss is harmless (a cursor position, a typing indicator). Over HTTP, `?ack=false` answers 202 at once.

## Connecting

A browser cannot send the `Authorization` header with an `EventSource` or a `WebSocket`, so the client first asks for
a ticket with its credentials, valid `REALTIME_TICKET_TTL` milliseconds and used once (stored in the `Memory`, so valid
on every instance):

| Route                                      | Description                                                                                        |
|--------------------------------------------|----------------------------------------------------------------------------------------------------|
| `POST <api>/realtime/ticket`               | Any authentication. Answers `{ ticket, expiresIn }`                                                |
| `GET <api>/realtime/ws?ticket=`            | The WebSocket. Not in the OpenAPI paths (the `x-appweaver-realtime` extension describes it)        |
| `GET <api>/realtime/events?ticket=&subscriptions=` | The SSE stream with the subscriptions of the query, a JSON array of `{ id, channel, params?, filter? }`. Changing them opens a new stream |
| `POST <api>/realtime/actions/:name?ack=`   | Calls an action, authenticated when the request carries credentials, answers `{ result }`, or 202 with `ack=false` |

Without a ticket a connection is refused (`REALTIME_TICKET_INVALID`), unless `REALTIME_ANONYMOUS_ENABLED`: then it is
anonymous, see [Public access](#public-access). A disabled transport (`REALTIME_SSE_ENABLED`,
`REALTIME_WEBSOCKET_ENABLED`) answers its route with `404 REALTIME_TRANSPORT_DISABLED`, and the `transports` of the
`x-appweaver-realtime` extension list only the enabled ones, which the `auto` transport of the client chooses from.

A connection is closed when the token of its ticket expires (`exp` of the JWT) or after `REALTIME_CONNECTION_MAX_AGE`,
with a `reauth` message and the close code `4401`: the client reconnects with a new ticket, and the user is loaded
again.

### Protocol

Every message is a JSON object, a WebSocket text frame or the `data` of an SSE event (whose `id` is the `eventId`).

| Client → server (WebSocket)                                      | Answer                                     |
|------------------------------------------------------------------|--------------------------------------------|
| `{ type: 'subscribe', id, channel, params?, filter? }`           | `{ type: 'subscribed', id }`               |
| `{ type: 'unsubscribe', id }`                                    | `{ type: 'unsubscribed', id }`             |
| `{ type: 'action', id, action, payload }`                        | `{ type: 'result', id, result }`           |
| `{ type: 'action', action, payload }` (fire-and-forget)          | nothing                                    |
| `{ type: 'ping', id? }`                                          | `{ type: 'pong', id? }`                    |

| Server → client                                                    | When                                                 |
|--------------------------------------------------------------------|------------------------------------------------------|
| `{ type: 'welcome', connectionId, expiresAt, heartbeat }`          | The connection is open                               |
| `{ type: 'event', id, channel, eventId, data }`                    | An event of the subscription `id`                    |
| `{ type: 'error', id?, error }`                                    | `error` is the problem details of the failed message |
| `{ type: 'reauth' }`                                               | The connection closes, reconnect with a new ticket   |

The subscriptions of a connection change in the order of its messages; the actions run at once. The subscription `id`
is chosen by the client (`[\w.:-]{1,64}`, unique on the connection).

| Close code | Meaning                                                    |
|------------|------------------------------------------------------------|
| `1001`     | The server shuts down                                      |
| `1008`     | A binary message                                           |
| `4401`     | The authentication expired, reconnect with a new ticket    |
| `4403`     | The ticket is missing or invalid                           |
| `4408`     | The client reads too slowly (`REALTIME_SEND_BUFFER_LIMIT`) |
| `4429`     | Too many connections of the instance or the user           |

Delivery is at-most-once: an event published while a client reconnects is lost. Reload the state the client shows after
a reconnection when it matters.

## Public access

Every realtime part is private by default: a subscription or a call needs an authenticated user. Two switches open
a part to the anonymous clients, both needed:

1. `realtime.anonymousEnabled` (`REALTIME_ANONYMOUS_ENABLED`) lets the clients connect without a ticket, and call the
   HTTP actions route without credentials.
2. `public: true` on a channel, the `events` of a model or an action marks what those clients may use. `roles` and
   `permissions` are ignored on a public part, and an authenticated user uses it too.

```jsonc
// appweaver.json
{
  "config": {
    "realtime": {
      "anonymousEnabled": true,
      "maxAnonymousConnectionsPerIp": 5 // per instance, by the IP of server.trustProxy
    }
  }
}
```

```dotenv
# .env
REALTIME_ANONYMOUS_ENABLED=true
REALTIME_MAX_ANONYMOUS_CONNECTIONS_PER_IP=5
```

```ts
// src/realtime/index.ts: a public channel, i.e. the stock prices of a homepage
export const stockPrice = createChannel({
  name: 'stock.price',
  public: true,
  payload: Type.Object({ symbol: Type.String(), price: Type.Number() }),
  params: Type.Object({ symbol: Type.Optional(Type.String()) }),
  deliver: (_, payload, params) => !params.symbol || params.symbol === payload.symbol
});

// A public action, called anonymously over the WebSocket or with POST /api/realtime/actions/page.view
createRealtimeAction({
  name: 'page.view',
  public: true,
  payload: Type.Object({ path: Type.String() }),
  handler: async ({ path }, { user }) => views.record(path, user?.id ?? null)
});

// src/resources/product/routes.ts: the public resource events of a model
export default createRoutes({
  modelName: 'product',
  events: { actions: ['create', 'update', 'delete'], public: true }
});

// src/resources/product/policy.ts: the events still pass the policy, called with a null user
export default createPolicy({
  modelName: 'product',
  events: (user, { current }) => current.published || (!!user && hasRole(user, 'admin'))
});
```

```ts
// The client of a page without a login
const client = createClient({ baseUrl: 'https://api.example.com', realtime: { anonymous: true } });
client.realtime.subscribe('stock.price', ({ symbol, price }) => render(symbol, price), { symbol: 'AAPL' });
client.realtime.on('Product', ({ action, current }) => refresh(action, current));
client.realtime.emit('page.view', { path: location.pathname });
```

A public channel without a `deliver` sends every payload to everyone, so publish nothing private on it. The resource
events of a public model go through the `events` callback of its policy, else its `checkAccess` and
`readRestrictions`, with a `null` user. An HTTP call with invalid credentials fails with `401` instead of running
anonymously.

## Client

The client generated by `weaver-client generate` has a `realtime` module, typed by the `RealtimeModuleType` generated
from the `x-appweaver-realtime` extension of the OpenAPI document:

```ts
const client = createClient({
  baseUrl: 'http://localhost:5000',
  auth: { jwt: () => tokens.accessToken },
  realtime: { transport: 'auto', reconnect: true }
});

const subscription = client.realtime.subscribe('order.shipped', (payload, meta) => show(payload), { orderId: 7 });
await subscription.ready; // rejects with the ClientError of a refused subscription
subscription.unsubscribe();

client.realtime.on('Order', (event) => update(event.current), { action: 'update', filter: { status: 'open' } });

const { seen } = await client.realtime.send('chat.typing', { roomId: 1 }); // waits for the result
client.realtime.emit('cursor.move', { x: 10, y: 20 });                       // fire-and-forget

client.realtime.onStateChange((state) => console.log(state)); // idle, connecting, open, reconnecting
client.realtime.onError((error) => console.error(error.code));
client.realtime.observe('order.shipped').subscribe({ next: show }); // from(...) of RxJS in Angular
```

See [client.md](./client.md#realtime-client) for the options.

## Config

`realtime.*` (`REALTIME_*`) and `pubsub.*` (`PUBSUB_*`), see [configuration.md](./configuration.md#realtime-realtime_).

## Errors

| Code                           | Status | When                                                         |
|--------------------------------|--------|--------------------------------------------------------------|
| `REALTIME_TICKET_INVALID`      | 401    | A missing, expired or used ticket                            |
| `REALTIME_CHANNEL_UNKNOWN`     | 404    | No such channel, or a model not exposing the action          |
| `REALTIME_SUBSCRIPTION_DENIED` | 403    | The access of the channel or its `subscribe` denies the user |
| `REALTIME_SUBSCRIPTION_LIMIT`  | 429    | `REALTIME_MAX_SUBSCRIPTIONS` reached                         |
| `REALTIME_ACTION_UNKNOWN`      | 404    | No such action                                               |
| `REALTIME_ACTION_DENIED`       | 403    | The access of the action denies the user                     |
| `REALTIME_PAYLOAD_INVALID`     | 400    | A payload or params not matching the schema                  |
| `REALTIME_MESSAGE_INVALID`     | 400    | A message breaking the protocol                              |
| `REALTIME_CONNECTION_LIMIT`    | 429    | `REALTIME_MAX_CONNECTIONS`, `_PER_USER` or `REALTIME_MAX_ANONYMOUS_CONNECTIONS_PER_IP` reached |
| `REALTIME_RATE_LIMITED`        | 429    | More than `REALTIME_MESSAGE_RATE_LIMIT` messages a second    |
| `REALTIME_TRANSPORT_DISABLED`  | 404    | The route of a disabled transport                            |

## Telemetry

With `telemetry.instrumentations.realtime`: the span `realtime action <name>` of every action, and the metrics
`appweaver.realtime.connections` (open connections by transport), `appweaver.realtime.events` (by channel and outcome:
`delivered`, `denied`, `dropped`) and `appweaver.realtime.messages` (client actions, by ack).

## Testing

An end-to-end test starts the application and connects with the global `WebSocket` and `fetch` of Node (or the
generated client), after a `POST <api>/realtime/ticket`. A unit test defines `MemoryPubSub` of `@appweaver/core/drivers`
for the `PubSub` of a channel. Test a `PubSub` driver with `testPubSubContract` of `@appweaver/testing`.
