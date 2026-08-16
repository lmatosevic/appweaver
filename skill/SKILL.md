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
- `.env.{env}` - override the central configuration for a specific environment (optional)
- `appweaver.json` - central library configuration file
- `appweaver.{env}.json` - environment specific configuration files that override the central configuration
- `Dockerfile` - the dockerfile used for building a docker image for deploying the application

**IMPORTANT:** `{env}` is controlled by `NODE_ENV` environment variable set before any command is executed (can also be
set in the `.env` file).

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
| `--database`      | Database type: `sqlite`, `postgresql`, `mysql`, `sqlserver`    | `sqlite`     |
| `--host`          | Hostname or IP address where the application server will bind. | 0.0.0.0      |
| `--port`          | Port number where the application server will listen.          | 5000         |
| `--agent`         | The AI agent for which to configure guidelines and skill files | `claude`     |
| `--bun`           | Use Bun as application runtime. (default is node and npm)      | false        |
| `--skipInstall`   | Skip all dependencies installation.                            | false        |
| `--noDocker`      | Skip Dockerfile, Dockerfile.bun and docker-compose.yml files   | false        |
| `--noRedis`       | Skip ioredis                                                   | false        |
| `--noQueue`       | Skip bullmq                                                    | false        |
| `--noMailer`      | Skip nodemailer                                                | false        |
| `--noCron`        | Skip cron                                                      | false        |

**Example — PostgreSQL project without queue:**

```sh
create-weaver-app MyBlogAPI "My own CMS for blogging" --database postgresql --noQueue
```

This creates a `./my-blog-api` directory, installs all dependencies, and runs the initial schema and type generation.
The default test runner is `jest` with `swc` transpiler.

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

const app = createApp({ autoStart: false, scanPath: './dist/my/app/path' });

// custom init logic...

app.start().then((address) => {
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
      type: 'oneToMany',
      mappedBy: 'products',
      owner: true,
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

Index entries are field names, nested in an array for a composite index. Prefix a name with `-` for a descending index
or `+` for an ascending one; without a prefix, the database default order is used:

```ts
index: ['-createdAt', ['status', '-createdAt']]
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
    title: {
      contains: '{input}',
      mode: 'insensitive'
    }
  }
});
```

Any code can reach a resource service with `injectService`, typed by the `<Model>ResourceService` alias `weaver
generate` emits per model, so no service type has to be written by hand:

```ts
import { injectService } from '@appweaver/core';
import { ProductResourceService } from '@/types/generated';

const products = injectService<ProductResourceService>('Product');
const product = await products.find(1);
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
  checkAccess: (user, resource, action) => resource.status === 'Draft',
  readRestrictions: (user, resource, action) => {
    enabled: true;
  },
  files: {
    photo: {
      accessType: 'public'
    }
  }
});
```

#### Creating an authentication model and service

Use `createAuthModel` and `createAuthService` instead of `createModel`/`createService` when the resource represents an
authenticatable user. They cannot be used independently! If an auth model is created, then also auth service must exist.

`createAuthModel` extends the config with: `email`, `passwordHash`, `verifiedEmail`, `twoFactorAuth`, `enabled`,
`logoutAt` scalars; a virtual `password` field (write-only); a `roles` relation; and an optional `apiKeys` relation
(when `SECURITY_API_KEY_ENABLED` is set).

`createAuthService` extends the config with automatic password hashing on create/update, an optional
`registrationData` callback to customize registration payload (for OAuth2 logins its `additionalData` argument includes
`firstName`, `lastName`, `avatarUrl`, and — when `SECURITY_OAUTH2_FETCH_AVATAR_ENABLED` is set — a downloaded
`avatarFile`), and an optional `checkOAuth2User` callback invoked before a user is registered or authenticated via
OAuth2 (return nothing to proceed, or a string/`Error`/`HttpError` to abort the login with an error).

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
  registrationData: (_, email, password) => ({ email, password, roles: [1, 2] })
});
```

#### Querying resources with filters

The `filter` argument of the `query`, `aggregate`, and `export` service methods (and of the matching `POST /query`,
`POST /aggregate`, `POST /export` routes) mirrors the WHERE part of a database query. It combines `_`-prefixed operators
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

const users = await injectService('User').query(filter, 1, 50, '-createdAt,id');
```

Filters are typed by `QueryFilter<T>` from `@appweaver/common`, and `weaver generate` emits a
`<Model>Query = QueryFilter<Model>` alias per model. Over HTTP, they are validated against a generated per-model
`<Model>QueryFilter` JSON schema, which strips unknown and hidden fields.

### Sorting

The `sort` argument of `query` and `export`, and the `sort` property of the `POST /query` and `POST /export` bodies,
accept either a comma-separated field list, where a `-` prefix sorts descending, or an object of `asc` and `desc` field
directions. Both sort by a field of an included to-one relation and by the record count of a to-many relation:

```ts
await injectService('Post').query({}, 1, 50, '-author.createdAt,tagsCount,id');
await injectService('Post').query({}, 1, 50, {
  author: { createdAt: 'desc' },
  tagsCount: 'asc',
  id: 'asc'
});
```

A hidden, virtual, or array scalar field, a field of a to-many relation, or a relation the action does not include is
rejected with a `400` error. Sort inputs are typed by `QuerySort<T>` from `@appweaver/common`, with a `<Model>Sort`
alias emitted per model and validated over HTTP against a generated `<Model>QuerySort` JSON schema. The default is
`-createdAt,id`.

### Aggregating

The required `select` argument of `aggregate` (and of the `POST /aggregate` body) holds the operators to apply per
field. Only the numeric fields (`count`, `sum`, `avg`, `min`, `max`, `first`, `last`), the date fields (all but `sum`
and `avg`), and the numeric `id` and audit fields of the model can be aggregated:

```ts
await injectService('Post').aggregate({}, {
  counter: { count: true, sum: true, avg: true, first: true, last: true },
  publishedAt: { min: true, max: true }
}, 'createdAt', '2026-01-01T00:00:00.000Z', '2026-01-08T00:00:00.000Z');
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
const stats = await injectService<PostResourceService>('Post').aggregate({}, { counter: { sum: true } });
stats.total.counter?.sum; // typed
stats.total.publishedAt;  // compile error, the field was not selected
```

### Registering a custom route

Use `registerRoute` to register a custom [Fastify route](https://fastify.dev/docs/latest/Reference/Routes/) handler. The
handler is a Fastify plugin function that defines one or more routes. An optional config object controls authentication,
caching, and reCAPTCHA behavior. When a custom route's 2xx response schema references resource output models (`<Name>`,
`<Name>Single` or `<Name>Multiple` — directly or nested inside custom schemas), virtual field values (e.g. `File.url`)
are projected onto the response payload automatically before serialization.

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

const cache: Mailer | undefined = inject(Mailer, false); // optional injection
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
      email: 'admin@appweaver.co',
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
weaver seed                                # run seeders
weaver seed --buildProject                 # build project first, then run seeders
weaver seed --continueOnError              # continue if a seeder throws error
weaver seed --fixWarnings                  # fix all warnings like invalid checksum or missing seeder
weaver seed --project tsconfig.build.json  # path to tsconfig build file
```

### Generate OpenAPI specification

```sh
weaver openapi                                        # generate schema to ./openapi.json
weaver openapi --outputPath ./generated/openapi.json  # generate schema to a custom path
weaver openapi --format yaml                          # generate schema in yaml format
```

### Update Appweaver packages

```sh
weaver update                                 # update all @appweaver/* packages to latest
weaver update @appweaver/core @appweaver/cli  # update specific packages
weaver update --targetVersion 1.2.3           # update to a specific version
weaver update --noSkill                       # skip updating AI agent skill files (.claude, .agents, …)
weaver update --force                         # force update despite peerDependency mismatches
```

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
