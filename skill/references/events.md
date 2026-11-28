# Events

The events module provides a resource-scoped publish/subscribe system built on top of Node.js `EventEmitter`. It is used
internally by the framework to broadcast resource lifecycle changes (`create`, `update`, `delete`, `find`, `query`) and
can be used directly to react to those events anywhere in the application.

## Injecting Events

```ts
import { inject } from '@appweaver/core';
import { Events } from '@appweaver/common';

const events = inject(Events);
```

---

#### `events.onResourceEvent(resourceName, event, listener)`

Registers a listener for a specific resource and action. Returns a listener ID that can be used to unsubscribe.

| Parameter      | Type               | Description                                             |
| -------------- | ------------------ | ------------------------------------------------------- |
| `resourceName` | `string`           | The name of the resource model (e.g. `'Product'`)       |
| `event`        | `ActionType`       | `'create'`, `'update'`, `'delete'`, `'find'`, `'query'` |
| `listener`     | `EventListener<T>` | Callback receiving `EventData<T>`                       |

Once the types are generated (`weaver generate`), the records are typed by the model name, like `injectService`:
`current` and `previous` are `ResourceRecord<'Product'>`, the model type with its foreign keys and relation counts,
and `current` is an array of them for a `query`. Give the type yourself for a model name known only at runtime,
`events.onResourceEvent<AuthUser>(modelName, 'update', listener)`.

`EventData<T>` shape:

```ts
type EventData<T> = {
  previous?: T; // present on 'update'
  current: T; // an array of resources on 'query'
};
```

The resources are the ones the service returns, the same objects: their virtual fields set (computed once, so a
non-deterministic one has the same value in the event and in the API response), their relation counts set (`postsCount`
instead of `_count`), and their soft deleted relations hidden. They still hold the hidden fields (i.e. `passwordHash`),
which only the response serialization leaves out. A change of a listener would reach the response, so the listener
receives them readonly at every depth (`DeepReadonly` of `@appweaver/common`): `current.status = 'x'` or
`current.items.push(item)` fails to compile. A function taking a record of an event takes it as
`DeepReadonly<Product>`, or the `Pick` of the fields it reads; to change one, copy it (`{ ...current, status: 'x' }`).

```ts
const listenerId = events.onResourceEvent(
  'Product',
  'create',
  ({ current }) => {
    logger.info('New product created:', current.name);
  }
);
```

**Listening to updates** (access both previous and current state):

```ts
events.onResourceEvent('User', 'update', ({ previous, current }) => {
  if (previous?.email !== current.email) {
    sendEmailChangeNotification(current);
  }
});
```

---

#### `events.emitResourceEvent<T>(resourceName, event, data)`

Emits an event for a resource. The framework calls this automatically after every resource mutation of a resource
service ([resources.md](./resources.md#createservice)); use it directly only when you need to emit custom events from
your own service logic.

| Parameter      | Type           | Description                                     |
| -------------- | -------------- | ----------------------------------------------- |
| `resourceName` | `string`       | Resource model name                             |
| `event`        | `ActionType`   | Action type                                     |
| `data`         | `EventData<T>` | Object with `current` (and optional `previous`) |

```ts
events.emitResourceEvent<Order>('Order', 'create', { current: newOrder });
```

---

#### `events.removeResourceEvent(listenerId)`

Unregisters a listener by the ID returned from `onResourceEvent`. Returns `true` if the listener was found and removed.

```ts
const listenerId = events.onResourceEvent('Product', 'delete', handler);
// ... later:
events.removeResourceEvent(listenerId);
```

---

## Realtime

The resource events stay in the process: the listeners of `onResourceEvent` run once, on the instance of the change. To
push them to the clients, expose them on the routes of the model with `createRoutes({ events: { actions } })` and the
`@appweaver/realtime` module, which publishes them through the `PubSub` contract (`memory` or `redis`) to the
realtime connections of every instance, each event checked against the access of the subscribed user. The `find` and
`query` events are never exposed. See [realtime.md](./realtime.md).

## Broadcasting between instances

`Events` stay in the process. To tell every instance something, use the `PubSub` contract: with `@appweaver/redis`
every subscribed instance receives a message (Redis pub/sub), otherwise only the process itself.

```ts
import { PubSub } from '@appweaver/common';
import { inject } from '@appweaver/core';

const pubsub = inject(PubSub);

await pubsub.subscribe<{ key: string }>('cache.cleared', ({ key }) =>
  localCache.delete(key)
);
await pubsub.publish('cache.cleared', { key: 'products' });
```

A message is JSON (dates arrive as strings), reaches the publisher too, and is delivered at most once: an instance
down or reconnecting misses it. Use it for what every instance should know now (a local cache, a flag, an ops
signal), and the `Queue` for work that must run once and survive a failure (an email, a payment). The `realtime:`
channels belong to `@appweaver/realtime`.

## Configuration

| Key                    | Type     | Default  | Description                           |
| ---------------------- | -------- | -------- | ------------------------------------- |
| `EVENTS_MAX_LISTENERS` | `int`    | `20`     | Max listeners per event (Node.js cap) |
| `EVENTS_PROVIDER`      | `string` | `'auto'` | `auto`/`node`, or a module path       |

## Real-world example

Register listeners at startup, then let the framework drive the emit side:

```ts
// src/features/notifications/notification-listener.ts
import { inject } from '@appweaver/core';
import { createLogger, Events, Mailer } from '@appweaver/common';

const logger = createLogger('notifications');

export function registerNotificationListeners() {
  const events = inject(Events);
  const mailer = inject(Mailer, false);

  events.onResourceEvent('Order', 'create', async ({ current }) => {
    if (!mailer) return;
    await mailer.sendEmail({
      to: current.customerEmail,
      subject: 'Order received',
      text: `Your order #${current.id} has been placed.`
    });
  });

  events.onResourceEvent('User', 'delete', ({ current }) => {
    logger.info(`User ${current.id} was deleted — cleaning up sessions`);
    cleanupSessions(current.id);
  });
}
```

Call `registerNotificationListeners()` during application startup, after the providers are loaded. A listener runs in
the process that made the change, so move slow or retried work to a queue ([queue.md](./queue.md)).

---

## Using Node.js EventEmitter directly

Since `Events` extends Node.js `EventEmitter`, you can use the standard `.on()` / `.emit()` API for custom application
events alongside the resource event helpers.

```ts
import { inject } from '@appweaver/core';
import { Events } from '@appweaver/common';

const events = inject(Events);

// Listen for a custom event
events.on('user-registered', (user: User) => {
  logger.info(`Welcome email queued for ${user.email}`);
  mailer.sendWelcomeEmail(user);
});

// Emit the event from your service
events.emit('user-registered', newUser);
```

You can use any string as the event name. The listener receives whatever arguments you pass to `emit`. Use
`events.once()` if you only need to handle the event one time:

```ts
events.once('user-registered', (user: User) => {
  logger.info(`First registration ever: ${user.email}`);
});
```
