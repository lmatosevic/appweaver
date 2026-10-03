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

Appweaver is a library for building backend REST APIs with TypeScript and Node.js (or Bun). From a declarative
resource model it derives the database schema, the TypeScript types, and validated CRUD routes with an OpenAPI
specification, and it adds authentication, authorization, file storage, caching, queues, scheduling, and mailing on top,
all driven by a centralized configuration. It is built on Fastify for the web server and Prisma for the database ORM.
The library provides factory functions for creating resource models, services, policies, and routes with predefined
defaults, and a CLI tool for building the application, starting a server, generating schema and types, executing
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
- `.env.{env}` - override the central configuration for a specific environment (optional)
- `appweaver.json` - central library configuration file
- `appweaver.{env}.json` - environment specific configuration files that override the central configuration
- `Dockerfile` - the dockerfile used for building a docker image for deploying the application

**IMPORTANT:** `{env}` is controlled by `NODE_ENV` environment variable set before any command is executed (can also be
set in the `.env` file). The environment names are `test`, `local`, `dev`, `staging`, `qa`, and `prod`; `development`
resolves to `dev`, and `production` or an unset `NODE_ENV` to `prod`.

## Core patterns

### Scaffolding a new application

Use `create-weaver-app` to scaffold a new project. It copies a default template, installs dependencies, and generates
initial Prisma schema and models.

```sh
create-weaver-app <name> [description] [options]
```

**Options:**

| Flag               | Description                                                    | Default      |
|--------------------|----------------------------------------------------------------|--------------|
| `-o, --output-dir` | Output directory (use ./ for current working directory)        | project name |
| `--database`       | Database type: `sqlite`, `postgresql`, `mysql`, `sqlserver`    | `sqlite`     |
| `--host`           | Hostname or IP address where the application server will bind. | 0.0.0.0      |
| `--port`           | Port number where the application server will listen.          | 5000         |
| `--agent`          | The AI agent for which to configure guidelines and skill files | `claude`     |
| `--bun`            | Use Bun as application runtime. (default is node and npm)      | false        |
| `--no-install`     | Skip all dependencies installation.                            | installs     |
| `--no-docker`      | Skip Dockerfile, Dockerfile.bun and docker-compose.yml files   | copied       |
| `--no-redis`       | Skip ioredis, use in-memory cache, rate limit and queue        | installed    |
| `--no-queue`       | Skip bullmq, use in-memory queue                               | installed    |
| `--no-mailer`      | Skip nodemailer, disable mailer (email features respond 501)   | installed    |
| `--no-cron`        | Skip cron, disable scheduler                                   | installed    |

**Example — PostgreSQL project without queue:**

```sh
create-weaver-app MyBlogAPI "My own CMS for blogging" --database postgresql --no-queue
```

This creates a `./my-blog-api` directory, installs all dependencies, and runs the initial schema and type generation.
The default test runner is `jest` with `swc` transpiler.

For a PostgreSQL, MySQL, or SQL Server project, the generated `docker-compose.yml` runs the database server (and Redis)
on their default ports (`5432`, `3306`, `1433`, and `6379` for Redis), also published on the host, so the development
`DATABASE_URL` and the default `REDIS_URL` reach them and `docker-compose up -d postgres redis` is enough to run the app
locally. The database credentials are stored in `.env` (`DB_NAME`, `DB_USER`, `DB_PASSWORD`), and the application
containers override the connection URLs to reach the other containers.

A SQLite project keeps its database file in the `data/` directory (`file:./data/<name>.db`), which the generated
`docker-compose.yml` mounts as the `sqlite-data` volume shared by the migration, seed, and application containers.

The generated `Dockerfile` builds the application and its production dependencies in a build stage, so the final image
carries no build tools. The image runs as the unprivileged `node` user (`bun` for Bun) and defaults to `NODE_ENV=prod`.
It declares no health check, which belongs to the orchestrator: point the Docker Compose `healthcheck` or the Kubernetes
probes at `GET /health/ready`, which answers `{ "ready": true }` once the application can serve requests and needs no
authentication. The `docker-compose.yml` services read `NODE_ENV` from `.env`, so the environment a container starts
in stays up to the project. Mounted `storage`, `logs`, and `data` directories must be writable by the image user.

**Linux hosts:** the `docker-compose.yml` services bind-mount the project's `./storage` and `./logs` directories, which
on Linux keep the owner they have on the host. A directory Docker creates itself is owned by `root`, so the image user
(uid `1000`) cannot write uploaded files, logs, or the generated JWT keys into it. Create both directories before the
first `docker compose up` and give them to uid `1000`:

```sh
mkdir -p storage logs && sudo chown -R 1000:1000 storage logs
```

Volumes created by an image version that still ran as `root` need the same change of owner, or recreating. Docker
Desktop on macOS and Windows maps the ownership of bind mounts itself and needs neither step.

**Example — Bun project with Sqlite:**

```sh
create-weaver-app BunApp "Bun application with simple API" --bun --database sqlite
```

This creates a `./bun-app` directory, installs all dependencies using bun package manager, and runs the initial schema
and type generation. The default test runner is `bun`.

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

**Install scripts:** npm 12+ blocks dependency install scripts by default. The scaffolded `package.json` ships an
`allowScripts` field (Bun: `trustedDependencies`) covering the packages Appweaver needs to build. Without it,
`npm install` skips the native builds and `weaver generate` fails. To approve a newly added dependency, run
`npm install-scripts approve <pkg>`; it writes the entry to the root `package.json`. Note that a `package.json`
`allowScripts` field makes npm ignore `.npmrc` `allow-scripts` entirely.

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

const app = await createApp({ autoStart: false, scanPath: './dist/my/app/path' });

// custom init logic...

const address = await app.start();
logger.info(address);
```

### Creating resources

Resources are the core building blocks for a web application. There are four resource types: **model**, **service**,
**routes**, and **policy**. Created and exported resources are loaded automatically on application start. Except for a
resource model, other resource types are optional and do not need to be created. A service requires the model, and
routes require the service. A policy only requires the model and applies to the service whether routes exist or not.

Dependencies: **model** ← **service** ← **routes**, and **model** ← **policy** (optional)

**DOS:**

- Use default configuration values whenever possible
- Rely on library defaults for `omit`/`pick`, ad `input`/`output` settings
- Use default `mimeType` and `namePattern` patterns in file configurations unless specifically requested
- Prefer storing configuration in JSON file (`appweaver.json`) over environment (`.env`) file, but prefer it for secrets
- Always create all four resource configs (model, service, routes, and policy) unless specified otherwise

**DON'TS:**

- Don't explicitly set default values in configuration unless specifically requested
- Don't override `omit`/`pick` for `read`, `create` and `update` settings unnecessarily
- Don't specify `input`/`output` configurations if defaults suffice
- Don't modify file's `mimeType` and `namePattern` patterns unless specifically instructed
- Don't customize index arrays without an explicit requirement

#### Creating a resource model

Resource model defines all aspects of the domain model: database table fields, relations, files, virtual fields, CRUD
data transfer objects. The exported model is used to construct Prisma schema, generate TypeScript types for all model
variations, define schema for CRUD routes, and input/output arguments to resource service methods.

```ts
// src/resources/product/model.ts
import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Product',
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
    lastViewedAt: {
      type: 'dateTime',
      defaultGenerator: 'now()'
    },
    enabled: {
      type: 'boolean',
      default: true
    }
  },
  relations: {
    category: {
      model: 'Category',
      type: 'manyToOne',
      mappedBy: 'products',
      output: {
        type: 'always'
      }
    }
  },
  files: {
    photo: {
      mimeType: 'image/*',
      maxSize: '2 MB',
      image: { quality: 80, maxWidth: 1200 }
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

A model has an auto-incrementing integer primary key unless the `id` block asks for a generated string one:

```ts
export default createModel({
  name: 'Comment',
  id: {
    type: 'string',
    generator: 'cuid(2)' // or uuid(), uuid(7), cuid(), nanoid()
  },
  scalars: { body: { type: 'string' } }
});
```

The choice flows through the Prisma column, the generated TypeScript type, the `:id` route path parameter, and the
relation inputs and foreign keys of every model pointing at it. Both ID types can be mixed across models.

A relation holding the foreign key of a one-to-many relation is declared with `type: 'manyToOne'`, as `category` above,
and the model it points at lists the inverse side with `type: 'oneToMany'`. The `omit` and `pick` lists of `read`,
`create`, and `update` only accept the fields the model declares, its `id`, and its audit fields.

Index entries are field names, nested in an array for a composite index. Prefix a name with `-` for a descending index
or `+` for an ascending one; without a prefix, the database default order is used:

```ts
index: ['-createdAt', ['status', '-createdAt']]
```

Foreign key columns are indexed automatically, unless an explicit index already leads with them. `unique` takes the
same shape as `index` for composite unique constraints, i.e. `unique: [['provider', 'providerAccountId']]`.

Set `softDelete: true` to keep deleted records in the database, marked by the `deletedAt` and `deletedById` columns,
instead of removing them. Soft deleted records are hidden from every read, so the API behaves exactly as after a real
delete, and a record can only be restored manually in the database. The relations cascading on delete are soft deleted
with the record, so every model a soft deleted model cascades into must enable `softDelete` too, or the application
fails to start. Stored files are removed on a regular delete but kept on a soft delete by default, configurable per
file field with `onResourceDeleted` and `onResourceSoftDeleted`. A kept file stays in the storage, e.g. for audit, but
is never served again.

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
    title: {
      contains: '{input}', // replaced by the searched text
      mode: 'insensitive' // PostgreSQL and MongoDB only
    }
  }
});
```

The types `weaver generate` emits register every model by name, so the factories and `injectService` infer the model
types from the model name alone: the hooks of `createService({ modelName: 'Product' })` receive `Product`,
`ProductCreate`, and `ProductUpdate` values, and a misspelled model name fails to compile. Never pass the types as
generic arguments. Any code can reach a resource service with `injectService`, typed by the `<Model>ResourceService`
alias of the model:

```ts
import { injectService } from '@appweaver/core';

const products = injectService('Product'); // ProductResourceService
const product = await products.find(1);
const cheapest = await products.single({ price: { _lt: 10 } }, 'price'); // the first match or null
const count = await products.count({ status: 'Active' });
const any = await products.exists({ status: 'Sold' });
```

The `afterUpdate` hook receives the updated resource along with the state it had before the update, i.e.
`afterUpdate: (product, previous) => { ... }`.

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
  find: {
    cache: true,
    roles: ['Admin', 'User'],
    rateLimit: {
      max: 100
    }
  },
  query: {
    cacheTTL: 5000
  },
  create: {
    permissions: ['product:create']
  },
  delete: {
    exclude: true
  }
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
  checkAccess: (user, resource, action) => action !== 'delete' || resource.status === 'Draft',
  readRestrictions: (user) => (user ? undefined : { enabled: true }), // anonymous users see enabled products only
  files: {
    photo: {
      accessType: 'public'
    }
  }
});
```

`checkAccess` denies the action by returning `false`, `readRestrictions` returns extra filter conditions for the reads
(or nothing to restrict none), and `writeRestrictions` returns data merged into the created or updated record.

Policy and file policy callbacks may be `async`, and receive a `null` user for an unauthenticated request. Wrap trusted
system code (jobs, seeders, custom flows) in `withoutPolicies(() => ...)` to call the resource services without the
policies; see [resources.md](references/resources.md#skipping-the-policies).

#### Creating an authentication model and service

Use `createAuthModel` and `createAuthService` instead of `createModel`/`createService` when the resource represents an
authenticatable user. They cannot be used independently! If an auth model is created, then also auth service must exist.

`createAuthModel` extends the config with: `email`, `passwordHash`, `verifiedEmail`, `twoFactorAuth`, `enabled`,
`logoutAt` scalars; a virtual `password` field (write-only); a `roles` relation; and an optional `apiKeys` relation
(when `SECURITY_API_KEY_ENABLED` is set).

`createAuthService` extends the config with automatic password hashing on create/update, an optional
`registrationData` callback to customize registration payload (for OAuth2 logins its `additionalData` argument includes
`firstName`, `lastName`, `avatarUrl`, and a downloaded `avatarFile` unless `SECURITY_OAUTH2_FETCH_AVATAR_ENABLED` is
turned off), an optional `registrationFiles` callback that maps the model's file fields to files stored right after
the user is created (the avatar included, since a file must be linked to an existing resource), and an optional
`checkOAuth2User` callback invoked before a user is registered or authenticated via OAuth2 (return nothing to proceed,
or a string/`Error`/`HttpError` to abort the login with an error).

```ts
// src/resources/user/model.ts
import { createAuthModel } from '@appweaver/core';

export default createAuthModel({
  name: 'User',
  scalars: {
    name: {
      type: 'string',
      maxLength: 100
    }
  },
  files: {
    avatar: {
      mimeType: 'image/(png|jpeg|gif)',
      maxSize: '2 MB',
      image: { quality: 80, maxHeight: 800, fit: 'inside' }
    }
  }
});
```

```ts
// src/resources/user/service.ts
import { createAuthService } from '@appweaver/core';

export default createAuthService({
  modelName: 'User',
  registrationData: (_, email, password) => ({ email, password, roles: [1, 2] }),
  registrationFiles: (_, data) => ({ avatar: data?.avatarFile })
});
```

The create and update inputs of an auth model include its `roles`, `password`, and `enabled` fields, so a scaffolded
project lets only the `Admin` role create, update, delete, and change the files of users through the `User` routes, and
signs new users up with the `User` role. A policy on the auth model applies only to the API routes: the framework's own
sign-up, logout, password change, and 2FA flows run with `withoutPolicies`, so a policy never blocks them.

#### Querying resources with filters

The `filter` option of the `query` and `aggregate` service methods, the `filter` argument of `single`, `count`,
`exists`, and `export` (and the `filter` of the matching `POST /query`, `POST /aggregate`, `POST /export` bodies)
mirrors the WHERE part of a database query. It combines `_`-prefixed operators
with plain value shorthands and nests through relations:

- **Logical**: `_and`, `_or`, `_not`, `_nor` — take a filter object (each entry becomes one condition) or a list of
  filter objects.
- **Comparison**: `_eq`, `_ne`, `_gt`, `_gte`, `_lt`, `_lte`, `_in`, `_nin`, `_between`, `_like`, `_ilike`, `_starts`,
  `_ends`, `_contains`, `_exists`, `_not`. Operators combined in one object must all match.
- **List fields**: `_has`, `_hasSome`, `_hasEvery`, `_isEmpty`.
- **Relations**: `_some`, `_every`, `_none` for list relations, `_exists` for any relation.
- **Shorthands**: a bare value matches by equality, a list by inclusion, a two-value list on a numeric or date field as
  an inclusive range, and a bare value or list on a relation matches by id.

```ts
import { injectService } from '@appweaver/core';
import { UserQuery } from '@/types/generated';

const filter: UserQuery = {
  _and: {
    firstName: { _eq: 'John', _exists: true },
    avatar: { _or: { title: { _eq: 'Avatar' }, description: { _like: '%avatar%' } } }
  },
  _or: [{ firstName: { _like: 'Jo%' } }, { lastName: 'Doe' }],
  roles: { _some: { name: { _contains: 'Admin' } } }
};

const users = await injectService('User').query({ filter, page: 1, size: 50, sort: '-createdAt' });
```

`query` takes a single options object, the same shape as the `POST /query` body: `filter`, `page` (default `1`),
`size` (default `50`), `sort` (default `-createdAt`), `cursor`, and `totalCount` (default `true`).

Filters are typed by `QueryFilter<T>` from `@appweaver/common`, and `weaver generate` emits a
`<Model>Query = QueryFilter<Model>` alias per model. Over HTTP, they are validated against a generated per-model
`<Model>QueryFilter` JSON schema, which strips unknown and hidden fields.

### Sorting

The `sort` option of `query`, the `sort` argument of `single` and `export`, and the `sort` property of the `POST /query`
and `POST /export` bodies accept either a comma-separated field list, where a `-` prefix sorts descending, or an
object of `asc` and `desc` field directions. Both sort by a field of an included to-one relation and by the record
count of a to-many relation:

```ts
await injectService('Post').query({ sort: '-author.createdAt,tagsCount,id' });
await injectService('Post').query({
  sort: { author: { createdAt: 'desc' }, tagsCount: 'asc', id: 'asc' }
});
```

A hidden, virtual, or array scalar field, a field of a to-many relation, or a relation the action does not include is
rejected with a `400` error. Sort inputs are typed by `QuerySort<T>` from `@appweaver/common`, with a `<Model>Sort`
alias emitted per model and validated over HTTP against a generated `<Model>QuerySort` JSON schema. The default is
`-createdAt`, and every sort is terminated with the primary key so paging stays deterministic.

### Aggregating

`aggregate` takes a single options object, the same shape as the `POST /aggregate` body: `select`, `filter`,
`dateField` (default `createdAt`), `from`, `to`, `step`, and `safeIncrement`. The required `select` holds the operators
to apply per field. Only the numeric fields (`count`, `sum`, `avg`, `min`, `max`, `first`, `last`), the date fields (all but `sum`
and `avg`), and the numeric `id` and audit fields of the model can be aggregated:

```ts
await injectService('Post').aggregate({
  select: {
    counter: { count: true, sum: true, avg: true, first: true, last: true },
    publishedAt: { min: true, max: true }
  },
  dateField: 'createdAt',
  from: '2026-01-01T00:00:00.000Z',
  to: '2026-01-08T00:00:00.000Z'
});
```

`first` and `last` take the value held by the earliest and the latest record of a period, ordered by the aggregated
`dateField` (ties broken by `id`). The database cannot aggregate them, so each period requesting them costs up to two
additional queries, skipped for the periods holding no record.

Any other field (string, boolean, enum, JSON, array, hidden, virtual, or a relation), an operator its type does not
support, an empty selection, or a `dateField` that is not a date field is rejected with a `400` error. Selections are
typed by `AggregateSelect<T>` from `@appweaver/common`, with a `<Model>Aggregate` alias emitted per model, and validated
over HTTP against a generated `<Model>AggregateSelect` JSON schema.

The response type is inferred from the selection, so a selection given as an object literal (or declared with
`satisfies <Model>Aggregate`) narrows it to the selected fields, while one annotated as `<Model>Aggregate` keeps every
aggregatable field of the model:

```ts
const stats = await injectService('Post').aggregate({ select: { counter: { sum: true } } });
stats.total.counter?.sum; // typed
stats.total.publishedAt;  // compile error, the field was not selected
```

### Registering a custom route

Use `registerRoute` to register a custom [Fastify route](https://fastify.dev/docs/latest/Reference/Routes/) handler. The
handler is a Fastify plugin function that defines one or more routes. An optional config object controls authentication,
caching, and reCAPTCHA behavior. When a custom route's 2xx response schema references resource output models (`<Name>`,
`<Name>Single` or `<Name>Multiple` — directly or nested inside custom schemas), virtual field values (e.g. `File.url`)
are projected onto the response payload automatically before serialization.

Route and model schemas are written with [TypeBox](https://github.com/sinclairzx81/typebox) (`@sinclair/typebox`), a
dependency of every scaffolded project at the version the framework uses, which `weaver update` keeps in step.

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
  Type.Object(
    {
      id: Type.Number(),
      title: Type.String(),
      score: Type.Number({ minimum: 0, maximum: 1 })
    },
    { $id: 'SearchResult' }
  )
);
```

### Registering plugin

Use `registerPlugin` to register a custom [Fastify plugin](https://fastify.dev/docs/latest/Reference/Plugins/). Plugins
are registered with `fastify-plugin` so their decorators and hooks are scoped to the entire server. You can declare
optional dependencies on other named plugins.

```ts
// src/plugins/audit-log.ts
import { registerPlugin } from '@appweaver/core';

registerPlugin('audit-log', async (server) => {
  server.addHook('onResponse', async (request, reply) => {
    console.log(`${request.method} ${request.url} → ${reply.statusCode}`);
  });
});
```

### Dependency injection

Use `define` to register a value or class in the app context, and `inject` to retrieve it. Class constructors are lazily
instantiated as singletons on the first injection.

```ts
import { Cache } from '@appweaver/common';
import { define, inject } from '@appweaver/core';

define(RedisCacheService, Cache); // register class under abstract token
define('https://api.example.com', 'ApiBaseUrl'); // register plain value

const cache = inject(Cache); // resolves singleton instance
const url = inject<string>('ApiBaseUrl'); // resolves by string token
```

Use `loadProvider` to dynamically load a class from a file path or npm package and register it under an abstract token.
This is the standard pattern for wiring infrastructure providers in `main.ts`.

```ts
import { loadProvider } from '@appweaver/core';
import { Database, Cache } from '@appweaver/common';

loadProvider(__dirname, config.DATABASE_PROVIDER, Database); // required provider
loadProvider(__dirname, config.CACHE_PROVIDER, Cache);
loadProvider(__dirname, config.MAILER_PROVIDER, Mailer, false); // optional (no error if provider cannot be loaded)

const mailer: Mailer | undefined = inject(Mailer, false); // optional injection
```

A registered class implementing `OnInit` or `OnDestroy` from `@appweaver/common`, and setting the static
`[LIFECYCLE] = true` tag, has its `onInit()` called when the application starts and its `onDestroy()` when it stops;
see [dependency-injection.md](references/dependency-injection.md#lifecycle-hooks).

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
  const password = config.SYSTEM_ADMIN_INITIAL_PASSWORD || randomString(16, { extra: false });

  await db.user.create({
    data: {
      firstName: 'Admin',
      lastName: 'Admin',
      email: config.SYSTEM_ADMIN_INITIAL_EMAIL,
      passwordHash: await hashPassword(password),
      roles: {
        connectOrCreate: [
          {
            where: { name: 'Admin' },
            create: {
              name: 'Admin',
              permissions: {
                connectOrCreate: [
                  { where: { name: 'manage' }, create: { name: 'manage' } },
                  { where: { name: 'view' }, create: { name: 'view' } }
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
weaver build --project tsconfig.build.json  # path to tsconfig build file
```

### Start application

```sh
weaver start                          # production
weaver start --watch                  # development (watch mode)
weaver start --project tsconfig.json  # path to tsconfig file
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
weaver seed                                                # run seeders
weaver seed --build-project                                # build project first, then run seeders
weaver seed --build-project --project tsconfig.build.json  # tsconfig file used for the build
weaver seed --continue-on-error                            # continue if a seeder throws error
weaver seed --fix-warnings                                 # fix all warnings like invalid checksum or missing seeder
```

### Generate OpenAPI specification

```sh
weaver openapi                                         # generate schema to ./openapi.json
weaver openapi --output-path ./generated/openapi.json  # generate schema to a custom path
weaver openapi --format yaml                           # generate schema in yaml format (./openapi.yaml)
```

### Update Appweaver packages

```sh
weaver update                                 # update all @appweaver/* packages to latest
weaver update @appweaver/core @appweaver/cli  # update specific packages
weaver update --target-version 1.2.3          # update to a specific version
weaver update --no-skill                      # skip updating AI agent skill files (.claude, .agents, …)
weaver update --force                         # force update despite peerDependency mismatches
weaver update --no-companions                 # skip the companion packages (prisma, bullmq, nodemailer, …)
weaver update --tooling                       # also update the tooling packages (eslint, jest, prettier, …)
weaver update --dry-run                       # print the updates without installing them
```

Besides the `@appweaver/*` packages, `weaver update` bumps the companion packages the project already has (Prisma
and its adapters, TypeBox, BullMQ, Cron, IoRedis, Nodemailer, TypeScript) to the exact versions the target release is built
with. It never adds missing packages or downgrades newer ones. Run `weaver generate` afterwards when Prisma is updated.

### Run tests

```sh
npm run test  # unit tests with coverage
npm run e2e   # e2e tests
```

Test files must use the **`.test.ts`** extension. Place unit tests in `test/unit/` and end-to-end tests in `test/e2e/`,
naming each file after its module. Add or update tests whenever a feature is added or existing behaviour changes.

The e2e setup and teardown are wired automatically, but **each e2e test file must register the per-file database reset
itself**, after the hook that stops the application:

```ts
import { resetTestData } from './support/reset';

describe('My e2e test', () => {
  let app: Application;

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
  });

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);
});
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
