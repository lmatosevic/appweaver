# Dependency Injection

The application context provides a lightweight dependency injection (DI) system through `define` and `inject`. Values,
class constructors, and singleton instances are stored in the context and resolved by name or class reference.

#### `define(value, nameOrClass?, mode?)`

Registers a value or class constructor in the application context.

| Parameter     | Type                                           | Description                                                                                           |
|---------------|------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| `value`       | any                                            | The value, instance, or class constructor to register                                                 |
| `nameOrClass` | `string \| symbol \| Class \| Function`        | Token used to look up this definition. Defaults to the value's class name or `RESOURCE_NAME` property |
| `mode`        | `'ignore' \| 'override' \| 'append' \| 'fail'` | How to handle duplicates. Defaults to `'ignore'`                                                      |

The `mode` decides what happens when a definition with the same name exists:

- `'ignore'` (default) – keeps the existing definition and logs a warning.
- `'append'` – adds another definition under the same name, all of them resolved by `injectAll`. A resource (model,
  service, routes, or policy) has one definition per name, so it replaces the existing one.
- `'override'` – replaces the existing definition.
- `'fail'` – throws an error.

**Register a plain value with a string token:**

```ts
import { define } from '@appweaver/core';

define('https://api.example.com', 'ApiBaseUrl');
```

**Register a class instance under an abstract class token:**

```ts
import { define } from '@appweaver/core';
import { SecurityStore } from '@appweaver/common';
import { MySecurityStore } from './my-security-store';

// MySecurityStore will be looked up by SecurityStore.name
define(new MySecurityStore(), SecurityStore);
```

**Register a class constructor (lazy instantiation on the first injection):**

```ts
import { define } from '@appweaver/core';
import { Cache } from '@appweaver/common';
import { MyCacheService } from './my-cache-service';

// MyCacheService is instantiated the first time inject(Cache) is called
define(MyCacheService, Cache);
```

**Register with a symbol token:**

```ts
import { define } from '@appweaver/core';

const RATE_LIMITER = Symbol('RateLimiter');
define(new TokenBucketLimiter(), RATE_LIMITER);
```

**Override an existing definition:**

```ts
import { define } from '@appweaver/core';
import { Cache } from '@appweaver/common';

define(new InMemoryCacheService(), Cache, 'override');
```

#### `inject(nameOrClass, required?)`

Retrieves a definition from the application context. If the stored value is a class constructor, it is instantiated on
first access, and the instance replaces the constructor in the context (singleton pattern).

| Parameter     | Type                                    | Description                            |
|---------------|-----------------------------------------|----------------------------------------|
| `nameOrClass` | `string \| symbol \| Class \| Function` | Token that identifies the definition   |
| `required`    | `boolean`                               | Throw if not found. Defaults to `true` |

**Inject by abstract class (the most common pattern):**

```ts
import { inject } from '@appweaver/core';
import { SecurityStore } from '@appweaver/common';

export class AuthService {
  private readonly _store = inject(SecurityStore);
}
```

**Inject by string token:**

```ts
import { inject } from '@appweaver/core';

const apiUrl = inject<string>('ApiBaseUrl');
```

A string token ending with `Model`, `Service`, `Routes`, or `Policy` (e.g. `'PostService'`) also resolves the resource
definition of that model, but only when no definition was registered under that exact name, so a value defined as
`'PaymentService'` is always injectable by that name.

**Inject by symbol token:**

```ts
import { inject } from '@appweaver/core';

const RATE_LIMITER = Symbol('RateLimiter');
const limiter = inject<RateLimiter>(RATE_LIMITER);
```

**Optionally inject (returns `undefined` instead of throwing):**

```ts
import { inject } from '@appweaver/core';
import { Mailer } from '@appweaver/common';

const mailer = inject(Mailer, false); // undefined if not registered, i.e. with MAILER_PROVIDER=none
if (mailer) {
  await mailer.sendEmail({ to: 'jane@example.com', subject: 'Welcome', text: 'Hello!' });
}
```

#### `isDefined(nameOrClass)` and `injectCreated(nameOrClass)`

`isDefined` checks if a definition is registered without creating its instance, i.e. whether a contract has a provider
or a module is enabled. `injectCreated` returns the instance only once it is created, `undefined` before, so it never
instantiates a class:

```ts
import { injectCreated, isDefined } from '@appweaver/core';
import { HttpServer } from '@appweaver/web';
import { Scheduler } from '@appweaver/common';

if (isDefined(Scheduler)) {
  // a scheduler driver is selected
}

const server = injectCreated(HttpServer)?.instance; // the Fastify instance, once the server is created
```

**Real-world example — service using injected dependencies:**

```ts
// src/features/notifications/notification-service.ts
import { CacheService, inject } from '@appweaver/core';
import { Mailer } from '@appweaver/common';

export class NotificationService {
  private readonly _mailer = inject(Mailer);
  private readonly _cache = inject(CacheService);

  public async notify(email: string, message: string): Promise<void> {
    const key = `notification:${email}`;
    if (await this._cache.getCachedValue(key)) return;
    await this._mailer.sendEmail({ to: email, subject: 'Notification', text: message });
    await this._cache.addToCache(key, true, 60_000);
  }
}
```

Then register it so other code can inject it:

```ts
import { define } from '@appweaver/core';
import { NotificationService } from './notification-service';

define(NotificationService);
// or define the instance directly:
define(new NotificationService(), NotificationService);
```

#### `injectAll(nameOrClass)` and `injectAllWhere(predicate)`

Resolve every definition registered under a name (see the `'append'` mode of `define`), or every definition matching a
predicate, instantiating the class constructors as `inject` does. Both return an empty array when nothing matches.

```ts
import { define, injectAll, injectAllWhere } from '@appweaver/core';

define(new SlackNotifier(), 'Notifier', 'append');
define(new EmailNotifier(), 'Notifier', 'append');

const notifiers = injectAll<Notifier>('Notifier'); // [SlackNotifier, EmailNotifier]
const lifecycle = injectAllWhere((def) => typeof def.value?.onInit === 'function');
```

#### `loadProvider(baseDir, classPath, definition?, required?)`

Dynamically loads a class from a file path and registers it in the context. The first exported constructor in the
resolved module is used. The infrastructure providers are defined by the modules from their `provider` keys (see
[modules](./modules.md)), which call `loadProvider` for a key holding a module path; call it directly only to load a
class from a configurable path.

| Parameter    | Type      | Description                                                                          |
|--------------|-----------|--------------------------------------------------------------------------------------|
| `baseDir`    | `string`  | Base directory for resolving relative paths                                          |
| `classPath`  | `string`  | Path to the module — relative to `baseDir`, project source path, or npm package name |
| `definition` | `Class`   | Abstract class / token to register the loaded class under                            |
| `required`   | `boolean` | Throw on load failure. Defaults to `true`                                            |

**Load a provider and register it under an abstract token:**

```ts
import { loadProvider } from '@appweaver/core';
import { Database } from '@appweaver/common';

// Loads the first exported class from './providers/postgres-database.ts'
// and registers it as Database
loadProvider(__dirname, './providers/postgres-database', Database);
```

**Load an optional class (no error if the file is missing), registered by its own class name:**

```ts
import { loadProvider } from '@appweaver/core';

loadProvider(__dirname, '../notifications/notification-service', undefined, false);
```

`selectedProvider(Contract)` returns the name of the provider the modules selected for a contract (`redis` for the
`Memory`), or `undefined` when none is.

`inject` resolves the definition when it is called and throws before the application has defined it. To hold the
database client in a module-level constant, use `injectDatabaseClient<PrismaClient>()` instead, which resolves the
client on every access.

## Lifecycle hooks

A class registered in the application context can run code when the application starts and stops by implementing the
interfaces of `@appweaver/common`, called in this order:

| Hook                       | Interface    | Runs                                                                                                                            |
|----------------------------|--------------|---------------------------------------------------------------------------------------------------------------------------------|
| `onInit()`                 | `OnInit`     | Once when the application starts.                                                                                               |
| `onReady({ startServer })` | `OnReady`    | Once every `onInit` finished, i.e. to start serving requests. `startServer` is `false` for `app.start(false)` and `weaver run`. |
| `onShutdown()`             | `OnShutdown` | First when the application stops, before any service is destroyed, i.e. to stop serving requests.                               |
| `onDestroy()`              | `OnDestroy`  | Last when the application stops, after every `onShutdown`, to release the resources.                                            |

The HTTP server is such a service: `HttpServer` of the `@appweaver/web` module listens in `onReady` and closes in
`onShutdown`, finishing the requests in flight before any service is destroyed.

The class must also set the static `[LIFECYCLE]` tag, otherwise its hooks are never called:

```ts
// src/features/rates/exchange-rates.ts
import { LIFECYCLE, OnDestroy, OnInit } from '@appweaver/common';
import { define } from '@appweaver/core';

export class ExchangeRates implements OnInit, OnDestroy {
  static [LIFECYCLE] = true;

  private _timer?: NodeJS.Timeout;

  async onInit(): Promise<void> {
    await this.refresh();
    this._timer = setInterval(() => this.refresh(), 60_000);
  }

  async onDestroy(): Promise<void> {
    clearInterval(this._timer);
  }

  private async refresh(): Promise<void> {
    // Load the current rates
  }
}

define(ExchangeRates);
```

- The hooks of one kind run in parallel for every class, with no order between them, so a hook must not rely on the
  same hook of another class having finished.
- Only the classes defined before the application is created are collected: the ones defined in the files the
  application loads on start (modules, resources and application files) or before `createApp()` is called.
- A class defined as a constructor is instantiated when the application is created, as the single instance every
  `inject` call then returns.
