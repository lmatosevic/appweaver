# Events

The events module provides a resource-scoped publish/subscribe system built on top of Node.js `EventEmitter`. It is used
internally by the framework to broadcast resource lifecycle changes (`create`, `update`, `delete`, `get`, `list`) and
can be used directly to react to those events anywhere in the application.

## Injecting Events

```ts
import { inject } from '@appweaver/core';
import { Events } from '@appweaver/common';

const events = inject(Events);
```

---

#### `events.onResourceEvent<T>(resourceName, event, listener)`

Registers a listener for a specific resource and action. Returns a listener ID that can be used to unsubscribe.

| Parameter      | Type               | Description                                           |
|----------------|--------------------|-------------------------------------------------------|
| `resourceName` | `string`           | The name of the resource model (e.g. `'Product'`)     |
| `event`        | `ActionType`       | `'create'`, `'update'`, `'delete'`, `'get'`, `'list'` |
| `listener`     | `EventListener<T>` | Callback receiving `EventData<T>`                     |

`EventData<T>` shape:

```ts
type EventData<T> = {
  previous?: T; // present on 'update' and 'delete'
  current: T;
};
```

```ts
const listenerId = events.onResourceEvent<Product>('Product', 'create', ({ current }) => {
  logger.info('New product created:', current.name);
});
```

**Listening to updates** (access both previous and current state):

```ts
events.onResourceEvent<User>('User', 'update', ({ previous, current }) => {
  if (previous?.email !== current.email) {
    sendEmailChangeNotification(current);
  }
});
```

---

#### `events.emitResourceEvent<T>(resourceName, event, data)`

Emits an event for a resource. The framework calls this automatically after every resource mutation; use it directly
only when you need to emit custom events from your own service logic.

| Parameter      | Type           | Description                                     |
|----------------|----------------|-------------------------------------------------|
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

## Configuration

| Key                    | Type     | Default                                | Description                           |
|------------------------|----------|----------------------------------------|---------------------------------------|
| `EVENTS_MAX_LISTENERS` | `int`    | `10`                                   | Max listeners per event (Node.js cap) |
| `EVENTS_PROVIDER`      | `string` | `'@appweaver/core/events/node-events'` | Path to the Events implementation     |

## Real-world example

Register listeners at startup, then let the framework drive the emit side:

```ts
// src/features/notifications/notification-listener.ts
import { inject } from '@appweaver/core';
import { Events, logger, Mailer } from '@appweaver/common';

export function registerNotificationListeners() {
  const events = inject(Events);
  const mailer = inject(Mailer, false);

  events.onResourceEvent<Order>('Order', 'create', async ({ current }) => {
    if (!mailer) return;
    await mailer.sendEmail({
      to: current.customerEmail,
      subject: 'Order received',
      text: `Your order #${current.id} has been placed.`
    });
  });

  events.onResourceEvent<User>('User', 'delete', ({ current }) => {
    logger.info(`User ${current.id} was deleted — cleaning up sessions`);
    cleanupSessions(current.id);
  });
}
```

Call `registerNotificationListeners()` during application startup, after the providers are loaded.

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
