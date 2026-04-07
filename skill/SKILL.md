---
name: appweaver
description: >
  Use this skill whenever the user is building, debugging, scaffolding, or
  asking questions about Appweaver - a web development library. Triggers
  include: any mention of 'Appweaver', requests to create backend server logic,
  configurations, resources, models, routes, services and security policy, 
  questions about the file conventions or config system. Use this skill
  if @appweaver npm package or Appweaver is detected anywhere in the project
  structure of Node.js (TypeScript) project.
---

# Appweaver skill

## Purpose

Appweaver is a library for building web applications with TypeScript and Node.js (or Bun). It provides a set of tools
and conventions to simplify the development process, including file-based routing, reusable UI components, and
centralized configuration. It is based mainly on Fastify for web server and Prisma for database ORM. The library
provides a series of factory methods used for creating resource models, services, policies, and routes with predefined
defaults. It provides a CLI tool for building the application, starting a server, generating schema and types, executing
migrations, running seeders, testing, and more.

## Project structure

The basic file structure of the Appweaver project:

- `database/` - database migrations, seeders, generated prisma client, and client used by the application
- `dist/` - the output directory for transpiled JavaScript files
- `public/` - publicly exposed files if static file serving is enabled
- `src/features/` - main application logic structured using vertical slice architecture (VSA)
- `src/resources/` - application resources (models, services, policies, and routes)
- `src/types/` - application types (generated and manually created)
- `src/main.ts` - the main application entrypoint
- `test/e2e/` - the end-to-end tests root directory
- `test/unit/` - the unit tests root directory
- `.env` - override the central configuration (optional)
- `.env.{env}` - override the central configuration for specific envirnment (optional)
- `appweaver.json` - central library configuration file
- `appweaver.{env}.json` - environment specific configuration files that override the central configuration
- `Dockerfile` - the dockerfile used for building a docker image for deploying the application

## Core patterns

### Scaffolding a new application

Use `create-weaver-app` to scaffold a new project. It copies a default template, installs dependencies, and generates
initial Prisma schema and models.

```sh
create-weaver-app <name> [description] [options]
```

**Options:**

| Flag              | Description                                                    | Default      |
|-------------------|----------------------------------------------------------------|--------------|
| `-o, --outputDir` | Output directory (use ./ for current working directory)        | project name |
| `-d, --database`  | Database type: `sqlite`, `postgresql`, `mysql`, `sqlserver`    | `sqlite`     |
| `--host`          | Hostname or IP address where the application server will bind. | 0.0.0.0      |
| `--port`          | Port number where the application server will listen.          | 5000         |
| `--bun`           | Use Bun as application runtime. (default is node and npm)      | false        |
| `--skipInstall`   | Skip all dependencies installation.                            | false        |
| `--noRedis`       | Skip ioredis                                                   | false        |
| `--noQueue`       | Skip bullmq                                                    | false        |
| `--noMailer`      | Skip nodemailer                                                | false        |
| `--noCron`        | Skip cron                                                      | false        |

**Example — PostgreSQL project without queue:**

```sh
create-weaver-app MyBlogAPI "My own CMS for blogging" --database postgresql --noQueue
```

This creates a `./my-blog-api` directory, installs all dependencies, and runs the initial schema and type generation.
Default test runner is `jest` with `swc` transpiler.

**Example — Bun project with Sqlite:**

```sh
create-weaver-app BunApp "Bun application with simple API" --bun --database sqlite
```

This creates a `./bun-app` directory, installs all dependencies using bun package manager, and runs the initial
schema and type generation. Default test runner is `bun`.

After the application is scaffolded, the following commands need to be run to finish the application setup:

```sh
npx weaver migration new init  # use --no-install flag if npx tries to install package
npm run seed
```

Or, for bun runtime:

```sh
bun weaver migration new init
bun run seed
```

### Creating and starting the application server

The main entrypoint to the application. This function creates an application object and initializes all resources and
services.

Default application bootstrap:

```ts
// src/main.ts
import { createApp } from '@appweaver/core';
import { logger } from '@appweaver/common';

createApp().catch((err) => logger.error(err));
```

Manually starting an application:

```ts
// src/main.ts
import { createApp } from '@appweaver/core';
import { logger } from '@appweaver/common';

const app = createApp({ autoStart: false, scanPath: './dist/my/app/path' });

// custom init logic...

app.start().then(address => {
  logger.info(address);
});
```

### Creating resources

Resources are the core building blocks for a web application. There are four resource types: **model**, **service**,
**routes**, and **policy**. Created and exported resources are loaded automatically on application start. Except for a
resource model, other resource types are optional and do not need to be created. If a service is created, then a model
must be also created. If routes are created, then service must be created. Only policy is not required for other
resources.

Dependency chain: **model** → **service** → **routes** → **policy**

#### Creating a resource model

Resource model defines all aspects of the domain model: database table fields, relations, files, virtual fields, CRUD
data transfer objects. The exported model is used to construct Prisma schema, generate TypeScript types for all model
variations, define schema for CRUD routes, and input/output arguments to resource service methods.

```ts
// src/resources/product/model.ts
import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Product',
  id: {
    type: 'int',
    generator: 'autoincrement()'
  },
  audit: {
    createdAt: true,
    updatedAt: true,
    createdById: true
  },
  scalars: {
    title: {
      type: 'string',
      minLength: 1,
      maxLength: 200
    },
    price: {
      type: 'float',
      minimum: 0
    },
    status: {
      type: 'enum',
      default: 'Draft',
      values: ['Draft', 'Active', 'Sold']
    },
    description: {
      type: 'string',
      required: false
    },
    enabled: {
      type: 'boolean',
      default: true
    }
  },
  relations: {
    category: {
      model: 'Category',
      owner: true,
      output: { type: 'always' }
    }
  },
  files: {
    photo: {
      mimeType: 'image/*',
      maxSize: '2 MB'
    }
  },
  create: {
    omit: ['status']
  },
  update: {
    pick: ['title', 'price', 'status', 'description']
  },
  index: ['title']
});
```

#### Creating a resource service

Resource service defines the business logic layer for a resource: lifecycle hooks (before/after create, update, delete),
custom data access behavior, and text search configuration. The exported service is automatically invoked by the CRUD
route handlers to perform database operations for a bound model and trigger side effects.

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

#### Creating the resource routes

Resource routes define which CRUD endpoints are exposed for a resource and how they behave: the base URL path,
per-operation role and permission requirements, caching settings, rate-limiting, and which operations to include or
exclude. The exported routes are registered automatically on application start and derive their request/response schemas
from the resource model.

```ts
// src/resources/product/routes.ts
import { createRoutes } from '@appweaver/core';

export default createRoutes({
  modelName: 'Product',
  path: '/products',
  find: { roles: ['Admin', 'User'], rateLimit: { max: 100 } },
  query: { cache: true, cacheTTL: 5000 },
  create: { permissions: ['product:create'] },
  delete: { exclude: true }
});
```

#### Creating a resource policy

Resource policy defines row-level security for a resource: dynamic access checks against individual resource instances,
read restrictions that filter which records are visible to the requester, and file access control. The service layer
evaluates the exported policy on every CRUD operation to enforce fine-grained authorization beyond a static role or
permission checks.

```ts
// src/resources/product/policy.ts
import { createPolicy } from '@appweaver/core';

export default createPolicy({
  modelName: 'Product',
  checkAccess: (action, resource) => resource.status === 'Draft',
  readRestrictions: (action, resource) => {
    enabled: true;
  },
  files: {
    photo: { accessType: 'public' }
  }
});
```

#### Creating an authentication model and service

Use `createAuthModel` and `createAuthService` instead of `createModel`/`createService` when the resource represents an
authenticatable user. They cannot be used independently! If an auth model is created, then also auth service must exist.

`createAuthModel` extends the config with: `email`, `passwordHash`, `verifiedEmail`, `twoFactorAuth`, `enabled`,
`logoutAt` scalars; a virtual `password` field (write-only); a `roles` relation; and an optional `apiKeys` relation (
when `SECURITY_API_KEY_ENABLED` is set).

`createAuthService` extends the config with automatic password hashing on create/update and an optional
`registrationData` callback to customize registration payload.

```ts
// src/resources/user/model.ts
import { createAuthModel } from '@appweaver/core';

export default createAuthModel({
  name: 'User',
  id: { type: 'int', generator: 'autoincrement()' },
  scalars: {
    name: { type: 'string', maxLength: 100 }
  }
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

### Registering a custom route

Use `registerRoute` to register a custom [Fastify route](https://fastify.dev/docs/latest/Reference/Routes/) handler. The
handler is a Fastify plugin function that defines one or more routes. An optional config object controls authentication,
caching, and reCAPTCHA behavior.

```ts
// src/plugins/custom-route.ts
import { registerRoute, Router } from '@appweaver/core';
import { Type } from '@sinclair/typebox';

registerRoute(
  async function (router: Router) {
    router.get('/search-result', {
      schema: {
        summary: 'Sample search result response route',
        response: {
          200: Type.Ref('SearchResult')
        }
      },
      handler: async () => {
        return { message: 'Hello, world!' };
      }
    });
  },
  { public: true, cacheTTL: 15000 }
);
```

### Registering a custom model

Use `registerModel` to register a custom [TypeBox](https://github.com/sinclairzx81/typebox) schema as a named model.
Registered models are added to the schema registry and can be referenced by `$ref` in route schemas.

```ts
// src/plugins/custom-model.ts
import { registerModel } from '@appweaver/core';
import { Type } from '@sinclair/typebox';

registerModel(
  'SearchResult',
  Type.Object({
    id: Type.Number(),
    title: Type.String(),
    score: Type.Number({ minimum: 0, maximum: 1 })
  })
);
```

### Registering plugin

Use `registerPlugin` to register a custom [Fastify plugin](https://fastify.dev/docs/latest/Reference/Plugins/). Plugins
are registered with `fastify-plugin` so their decorators and hooks are scoped to the entire server. You can declare
optional dependencies on other named plugins.

```ts
// src/plugins/audit-log.ts
import { registerPlugin } from '@appweaver/core';

registerPlugin(
  'audit-log',
  async (server) => {
    server.addHook('onResponse', async (request, reply) => {
      console.log(`${request.method} ${request.url} → ${reply.statusCode}`);
    });
  }
);
```

### Dependency injection

Use `define` to register a value or class in the app context, and `inject` to retrieve it. Class constructors are
lazily instantiated as singletons on the first injection.

```ts
import { Cache } from '@appweaver/common';
import { define, inject } from '@appweaver/core';

define(RedisCacheService, Cache);          // register class under abstract token
define('https://api.example.com', 'ApiBaseUrl'); // register plain value

const cache = inject(Cache);              // resolves singleton instance
const url = inject<string>('ApiBaseUrl'); // resolves by string token
```

Use `loadProvider` to dynamically load a class from a file path or npm package and register it under an abstract token.
This is the standard pattern for wiring infrastructure providers in `main.ts`.

```ts
import { loadProvider } from '@appweaver/core';
import { Database, Cache } from '@appweaver/common';

loadProvider(__dirname, config.DATABASE_PROVIDER, Database);    // required provider
loadProvider(__dirname, config.CACHE_PROVIDER, Cache);
loadProvider(__dirname, config.MAILER_PROVIDER, Mailer, false); // optional (no error if provider cannot be loaded)

const cache: Mailer | undefined = inject(Mailer, false);        // optional injection
```

### Writing a seeder

A seeder is a TypeScript file that must export at least one asynchronous function responsible for executing database
seeding logic. Seeder files follow the same conventions as migration files: they can only be executed once, and their
execution status is recorded in the database table `_seeders`. Seeders are executed in alphabetical order; therefore,
the recommended naming convention is to prefix the filename with an ordinal number (e.g., `001-create-admin-user.ts`).

During execution of seeder functions, the full application context is available, which means it is possible to inject
any service or model previously defined in the main application logic or exported from other NPM packages.

```ts
// database/seeders/001-create-admin-user.ts

import { hashPassword } from '@appweaver/core';
import { config, randomString } from '@appweaver/common';
import { db } from '@db/client';

export async function createAdminUser(): Promise<void> {
  await db.user.create({
    data: {
      firstName: 'Admin',
      lastName: 'Admin',
      email: 'admin@appweaver.com',
      phone: '01234435',
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

## Common tasks

### Build application

```sh
weaver build
```

### Start application

```sh
weaver start          # production
weaver start --watch  # development (watch mode)
```

### Generate types and schema

```sh
weaver generate --types           # TypeScript types only
weaver generate --schema          # Prisma schema only
weaver generate --types --schema  # both (same as with no option flags)
```

### Run database migrations

```sh
weaver migrate                        # run pending migrations
weaver migration new <name>           # create a new migration
weaver migration reset                # reset database (prompts confirmation)
weaver migration reset --force --yes  # force reset, skip confirmation
```

### Seed the database

```sh
weaver seed                         # run seeders
weaver seed --buildProject          # build project first, then run seeders
weaver seed --continueOnError       # continue if a seeder throws error
weaver seed --fixWarnings           # fix all warnings like invalid checksum or missing seeder
```

### Run tests

```sh
npm run test  # unit tests with coverage
npm run e2e   # e2e tests
```

### Format code

```sh
npm run format  # prettier --write "./**/*.ts"
```

### Lint code

```sh
npm run lint  # eslint "./**/*.ts"
```

## References

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
