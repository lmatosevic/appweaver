# Appweaver Guidelines

Appweaver is a TypeScript/Node.js library for building web applications. Built on Fastify (HTTP) and Prisma (ORM), it
provides factory methods for creating resource models, services, policies, and routes with sensible defaults.

## Project structure

- `database/` - migrations, seeders, generated Prisma client
- `dist/` - transpiled JavaScript output
- `public/` - static files (if enabled)
- `src/features/` - application logic (vertical slice architecture)
- `src/resources/` - resources (models, services, policies, routes)
- `src/types/` - generated and manual types
- `src/main.ts` - application entrypoint
- `test/e2e/` - end-to-end tests
- `test/unit/` - unit tests
- `.env` / `.env.{env}` - environment variable overrides (optional)
- `appweaver.json` / `appweaver.{env}.json` - central configuration
- `Dockerfile` - Docker image definition

**IMPORTANT:** `{env}` is controlled by `NODE_ENV` evironment variable.

## Application entrypoint

```ts
// src/main.ts
import { createApp } from '@appweaver/core';
import { logger } from '@appweaver/common';

createApp().catch((err) => logger.error(err));
```

## Creating resources

Resources are the core building blocks. There are four types: **model**, **service**, **routes**, and **policy**.
Exported resources are loaded automatically on application start.

Dependency chain: **model** → **service** → **routes** → **policy**

Only a model is required. If a service exists, a model must exist. If routes exist, a service must exist. Policy is
independent.

**DOS:**

- Use default configuration values whenever possible
- Rely on library defaults for `omit`/`pick`, and `input`/`output` settings
- Use default `mimeType` and `namePattern` patterns in file configurations unless specifically requested
- Prefer storing configuration in JSON file (`appweaver.json`) over environment (`.env`) file, but prefer it for secrets
- Always create all four resource configs (model, service, routes, and policy) unless specified otherwise

**DON'TS:**

- Don't explicitly set default values in configuration unless specifically requested
- Don't override `omit`/`pick` for `read`, `create` and `update` settings unnecessarily
- Don't specify `input`/`output` configurations if defaults suffice
- Don't modify file's `mimeType` and `namePattern` patterns unless specifically instructed
- Don't customize index arrays without an explicit requirement

### Model

```ts
// src/resources/product/model.ts
import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Product',
  scalars: {
    title: { type: 'string', minLength: 1, maxLength: 200 },
    price: { type: 'float', minimum: 0 },
    status: { type: 'enum', default: 'Draft', values: ['Draft', 'Active', 'Sold'] },
    description: { type: 'string', required: false },
    lastViewedAt: { type: 'dateTime', defaultGenerator: 'now()' },
    enabled: { type: 'boolean', default: true }
  },
  relations: {
    category: { model: 'Category', mappedBy: 'products', owner: true, output: { type: 'always' } }
  },
  files: {
    photo: { mimeType: 'image/*', maxSize: '2 MB' }
  },
  create: { omit: ['status'] },
  update: { pick: ['title', 'price', 'status', 'description'] },
  index: ['title']
});
```

### Service

```ts
// src/resources/product/service.ts
import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Product',
  afterCreate: (resource) => {
    console.log('Product created:', resource.id);
  },
  textSearch: {
    title: { contains: '{input}', mode: 'insensitive' }
  }
});
```

### Routes

```ts
// src/resources/product/routes.ts
import { createRoutes } from '@appweaver/core';

export default createRoutes({
  modelName: 'Product',
  find: { cache: true, roles: ['Admin', 'User'], rateLimit: { max: 100 } },
  query: { cacheTTL: 5000 },
  create: { permissions: ['product:create'] },
  delete: { exclude: true }
});
```

### Policy

```ts
// src/resources/product/policy.ts
import { createPolicy } from '@appweaver/core';

export default createPolicy({
  modelName: 'Product',
  checkAccess: (user, resource, action) => resource.status === 'Draft',
  readRestrictions: (user, resource, action) => {
    enabled: true;
  },
  files: {
    photo: { accessType: 'public' }
  }
});
```

### Auth model and service

Use `createAuthModel` and `createAuthService` for authenticatable users. They must be used together.

`createAuthModel` adds: `email`, `passwordHash`, `verifiedEmail`, `twoFactorAuth`, `enabled`, `logoutAt` scalars; a
virtual `password` field; a `roles` relation; and optional `apiKeys` relation.

```ts
// src/resources/user/model.ts
import { createAuthModel } from '@appweaver/core';

export default createAuthModel({
  name: 'User',
  scalars: { name: { type: 'string', maxLength: 100 } },
  files: { avatar: { mimeType: 'image/(png|jpeg|gif)', maxSize: '2 MB' } }
});
```

```ts
// src/resources/user/service.ts
import { createAuthService } from '@appweaver/core';

export default createAuthService({
  modelName: 'User',
  registrationData: (_, email, password) => ({ email, password, roles: [1, 2] })
});
```

## Custom routes, models, and plugins

### Custom route

```ts
// src/features/custom-route.ts
import { registerRoute, Router } from '@appweaver/core';
import { Type } from '@sinclair/typebox';

registerRoute(
  async function (router: Router) {
    router.get('/search-result', {
      schema: { summary: 'Search result', response: { 200: Type.Ref('SearchResult') } },
      handler: async () => ({ message: 'Hello, world!' })
    });
  },
  { public: true, cacheTTL: 15000 }
);
```

### Custom model

```ts
// src/features/custom-model.ts
import { registerModel } from '@appweaver/core';
import { Type } from '@sinclair/typebox';

registerModel(
  Type.Object(
    { id: Type.Number(), title: Type.String(), score: Type.Number({ minimum: 0, maximum: 1 }) },
    { $id: 'SearchResult' }
  )
);
```

### Plugin

```ts
// src/plugins/audit-log.ts
import { registerPlugin } from '@appweaver/core';

registerPlugin('audit-log', async (server) => {
  server.addHook('onResponse', async (request, reply) => {
    console.log(`${request.method} ${request.url} → ${reply.statusCode}`);
  });
});
```

## Dependency injection

```ts
import { Cache } from '@appweaver/common';
import { define, inject, loadProvider } from '@appweaver/core';

define(RedisCacheService, Cache);                // register class under abstract token
define('https://api.example.com', 'ApiBaseUrl'); // register plain value

const cache = inject(Cache);                     // resolve singleton
const url = inject<string>('ApiBaseUrl');        // resolve by string token

// Dynamic provider loading (typical in main.ts)
loadProvider(__dirname, config.CACHE_PROVIDER, Cache);
loadProvider(__dirname, config.MAILER_PROVIDER, Mailer, false); // optional
```

## Seeders

Seeder files export async functions and run in alphabetical order. Prefix filenames with ordinal numbers.

```ts
// database/seeders/001-create-admin-user.ts
import { hashPassword } from '@appweaver/core';
import { db } from '@db/client';

export async function createAdminUser(): Promise<void> {
  await db.user.create({
    data: {
      firstName: 'Admin',
      lastName: 'Admin',
      email: 'admin@appweaver.com',
      roles: {
        connectOrCreate: [
          {
            where: { name: 'Admin' },
            create: {
              name: 'Admin',
              permissions: {
                connectOrCreate: [
                  { where: { name: '*.read' }, create: { name: '*.read' } },
                  { where: { name: '*.write' }, create: { name: '*.write' } }
                ]
              }
            }
          }
        ]
      }
    }
  });
}
```

## Common commands

| Command                       | Description                               |
|-------------------------------|-------------------------------------------|
| `npm run generate`            | Generate TypeScript types + Prisma schema |
| `npm run build`               | Build the application                     |
| `npm run start`               | Start in production mode                  |
| `npm run dev`                 | Start in development (watch) mode         |
| `npm run seed`                | Seed the database                         |
| `npm run migrate`             | Apply pending database migrations         |
| `npm run test`                | Run unit tests                            |
| `npm run e2e`                 | Run end-to-end tests                      |
| `npm run format`              | Format code with Prettier                 |
| `npm run lint`                | Lint code with ESLint                     |
| `weaver migration new <name>` | Create a new database migration           |
| `weaver update`               | Update all @appweaver/* packages          |
| `weaver openapi`              | Generate OpenAPI specification            |

## References

- Application CLI (weaver): [cli.md](references/cli.md)
- Application configuration: [configuration.md](references/configuration.md)
- Application resources: [resources.md](references/resources.md)
- Dependency injection: [dependency-injection.md](references/dependency-injection.md)
- Security details: [security.md](references/security.md)
- Storage & File management: [storage.md](references/storage.md)
- Database & Migrations: [database.md](references/database.md)
- Events & Hooks: [events.md](references/events.md)
- Cache management: [cache.md](references/cache.md)
- Queue jobs: [queue.md](references/queue.md)
- Scheduling jobs: [scheduler.md](references/scheduler.md)
- Sending emails: [mailer.md](references/mailer.md)
- Generating an HTTP client for using API: [client.md](references/client.md)
