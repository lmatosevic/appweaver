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

**Register a plain value with a string token:**

```ts
import { define } from '@appweaver/core';

define('https://api.example.com', 'ApiBaseUrl');
```

**Register a class instance under an abstract class token:**

```ts
import { define } from '@appweaver/core';
import { SecurityStore } from '@appweaver/common';
import { RedisSecurityStore } from './redis-security-store';

// RedisSecurityStore will be looked up by SecurityStore.name
define(new RedisSecurityStore(), SecurityStore);
```

**Register a class constructor (lazy instantiation on the first injection):**

```ts
import { define } from '@appweaver/core';
import { Cache } from '@appweaver/common';
import { RedisCacheService } from './redis-cache-service';

// RedisCacheService is instantiated the first time inject(Cache) is called
define(RedisCacheService, Cache);
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

const mailer = inject(Mailer, false); // undefined if not registered
if (mailer) {
  await mailer.send(message);
}
```

**Real-world example — service using injected dependencies:**

```ts
// src/features/notifications/notification-service.ts
import { inject } from '@appweaver/core';
import { Mailer, Cache } from '@appweaver/common';
import { CacheService } from '@appweaver/core';

export class NotificationService {
  private readonly _mailer = inject(Mailer);
  private readonly _cache = inject(CacheService);

  async notify(userId: number, message: string) {
    const key = `notification:${userId}`;
    if (await this._cache.getCachedValue(key)) return;
    await this._mailer.send({ to: userId, body: message });
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

#### `loadProvider(baseDir, classPath, definition?, required?)`

Dynamically loads a class from a file path and registers it in the context. The first exported constructor in the
resolved module is used. This is the standard way to load infrastructure provider implementations that are configured
via environment-specific paths.

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

**Load an optional provider (no error if the file is missing):**

```ts
import { loadProvider } from '@appweaver/core';
import { Queue } from '@appweaver/common';

loadProvider(__dirname, config.QUEUE_PROVIDER, Queue, false);
```

**Load a provider from an NPM package:**

```ts
import { loadProvider } from '@appweaver/core';
import { Cache } from '@appweaver/common';

loadProvider(__dirname, '@myorg/redis-cache', Cache);
```

**Loading multiple providers at startup (typical `main.ts` pattern):**

```ts
// src/main.ts
import { loadProvider } from '@appweaver/core';
import { Database, Cache, Mailer } from '@appweaver/common';
import { config } from '@appweaver/common';

// Required infrastructure
loadProvider(__dirname, config.DATABASE_PROVIDER, Database);
loadProvider(__dirname, config.CACHE_PROVIDER, Cache);

// Optional infrastructure
loadProvider(__dirname, config.MAILER_PROVIDER, Mailer, false);

// Internal feature service (no token — registered by its own class name)
loadProvider(__dirname, '../notifications/notification-service', undefined, false);
```

After `loadProvider` runs, the loaded class is available via `inject`:

```ts
import { inject } from '@appweaver/core';
import { Database } from '@appweaver/common';

const db = inject(Database); // resolves the class loaded from config.DATABASE_PROVIDER
```
