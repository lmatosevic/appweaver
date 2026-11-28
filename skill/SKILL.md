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
- `locales/` - the translation files, a nested JSON file per locale (`en.json`, `de.json`, `locales` module)
- `public/` - publicly exposed files if static file serving is enabled
- `src/features/` - main application logic structured using vertical slice architecture (VSA)
- `src/resources/` - application resources (models, services, policies, and routes)
- `src/types/` - application types (generated and manually created)
- `src/main.ts` - the main application entrypoint
- `templates/` - the Handlebars templates of emails, HTML pages, XML exports or any other text (`*.<format>.hbs`,
  `templates` module)
- `test/e2e/` - the end-to-end tests root directory
- `test/unit/` - the unit tests root directory
- `.env` - override the central configuration (optional)
- `.env.{env}` - override the central configuration for a specific environment (optional)
- `appweaver.json` - central library configuration file, with the overrides of each environment under `environments`
- `appweaver.{env}.json` - environment specific configuration files, overriding the `environments` section (optional)
- `Dockerfile` - the dockerfile used for building a docker image for deploying the application (`docker` module)
- `tsconfig.json` - no `baseUrl` (the `paths` such as `@/*` are relative to the file), `rootDir: "./"`,
  the `types` listed (`["node", "jest"]`), and `strict`, so `noImplicitAny` is on: type every parameter, and an object
  built key by key as `Record<string, unknown>`

**IMPORTANT:** `{env}` is controlled by `NODE_ENV` environment variable set before any command is executed (can also be
set in the `.env` file). The environment names are `test`, `local`, `dev`, `staging`, `qa`, and `prod`; `development`
resolves to `dev`, and `production` or an unset `NODE_ENV` to `prod`.

## Core patterns

### Scaffolding a new application

Use `@appweaver/create` (the `create-appweaver` binary) to scaffold a new project. It copies the base template, a
minimal application of the core module, adds the selected modules (`data` and `web` by default), installs dependencies,
and generates the Prisma schema and the types with `data` (only the JSON Schema of `appweaver.json` without it). It is a
one-shot command without prompts.

```sh
npx @appweaver/create <name> [description] [options]
npm create @appweaver <name> [description] -- [options]  # the same, npm passes the options after --
```

**Options:**

| Flag                     | Description                                                                   | Default      |
|--------------------------|-------------------------------------------------------------------------------|--------------|
| `--add <modules...>`     | Modules to add to the default ones, separated by spaces or commas             | `data web`   |
| `--all`                  | Add every module                                                              | false        |
| `--exclude <modules...>` | Modules to leave out of the default ones or of `--all` (e.g. `--exclude web`) | none         |
| `-o, --output-dir <dir>` | Output directory (use ./ for current working directory)                       | project name |
| `--database <type>`      | Database of `data`: `sqlite`, `postgresql`, `mysql`, `sqlserver`              | `sqlite`     |
| `--host <host>`          | Hostname or IP address the server of `web` binds to                           | `0.0.0.0`    |
| `--port <port>`          | Port number the server of `web` listens on                                    | `5000`       |
| `--bun`                  | Use Bun as the application runtime (Node and npm otherwise)                   | Node         |
| `--agent <agent>`        | The AI agent to configure the guidelines and skill files for                  | `claude`     |
| `--no-install`           | Skip the installation of the dependencies                                     | installs     |

**Modules:** the base project depends only on `@appweaver/cli`, `@appweaver/common`, `@appweaver/core` and TypeBox: an
application with neither a database nor a server (`src/main.ts`, an e2e test of its health checks). `data` and `web`
are the default modules, added to it unless excluded, so a project is a web API by default. Every other module is added
with `--add`, `--all`, or later with `weaver module add` (see [Managing modules](#managing-modules)). `--exclude` leaves
out any module, with or without `--all`: `--exclude web` for a database worker without a server, `--exclude data web`
for the core application alone, i.e. a one-shot task (`weaver run`). `--database`, `--host` and `--port` apply only
with `data` and `web`:

| Module           | Adds                                                                                                            | Without it                                  |
|------------------|-----------------------------------------------------------------------------------------------------------------|---------------------------------------------|
| `data` (default) | `@appweaver/data`, `@appweaver/sharp`, Prisma, `database/`, the generated types, the test database              | no database, no resources                   |
| `web` (default)  | `@appweaver/web` (requires `data`), the server config, the `User` auth resource and its admin seeder, `public/` | no HTTP server, no auth model               |
| `redis`          | `@appweaver/redis`, the `memory.redis.url`, the docker-compose Redis service                                    | memory, cache and rate limit in the process |
| `queue`          | `@appweaver/bullmq` (requires `redis`, added along with it)                                                     | in-memory queue                             |
| `scheduler`      | `@appweaver/cron`                                                                                               | scheduler disabled                          |
| `mailer`         | `@appweaver/nodemailer`                                                                                         | mailer disabled (no email routes)           |
| `templates`      | `@appweaver/handlebars`, `templates/`, the account emails with the mailer                                       | no template engine                          |
| `locales`        | `locales/en.json`, the account email texts with the mailer                                                      | English texts written into the templates    |
| `timeseries`     | The `series` fields in the database (requires `data`), `timescale` and the TimescaleDB image on PostgreSQL      | time series in the database (`auto`)        |
| `telemetry`      | `@appweaver/opentelemetry`, the OTLP endpoint, telemetry off in the `test` environment                          | no telemetry exported                       |
| `realtime`       | `@appweaver/realtime` (requires `web`): channels, resource events, actions and streams over WebSocket and SSE    | no realtime connections                     |
| `mcp`            | `@appweaver/mcp` (requires `web`): the MCP server of the AI agents at `/mcp`                               | no MCP server                               |
| `ai`             | `@appweaver/ai` and `@appweaver/openai`: `AiService` on a local Ollama in `dev`, the `mock` model in `test`     | no AI models                                |
| `docker`         | `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `start.sh`                                                 | no Docker files                             |

Options are given after the positional arguments, since `--add` and `--exclude` take every following value up to the
next option.

**Example — PostgreSQL API with Redis, mailer and Docker:**

```sh
npx @appweaver/create MyBlogAPI "My own CMS for blogging" --database postgresql --add redis mailer docker
npx @appweaver/create MyBlogAPI "My own CMS for blogging" --database postgresql --all --exclude queue
npx @appweaver/create Reports "Nightly reports" --add scheduler --exclude web  # a database worker without a server
npx @appweaver/create Calculator "Loan calculator" --exclude data web         # the core application alone
```

This creates a `./my-blog-api` directory, installs all dependencies, and runs the initial schema and type generation.
The default test runner is `jest` with `swc` transpiler.

The connections are configured in the committed `appweaver.json` (the test database in its `environments.test`
section), whose `${VAR}` references are expanded from the environment. Only the database password goes to the gitignored
`.env` (copied to a committed `.env.example`):

```json
{
  "config": {
    "database": {
      "url": "postgresql://${DB_USER:-my-blog-api}:${DB_PASSWORD}@${DB_HOST:-localhost}:5432/${DB_NAME:-my-blog-api}"
    },
    "memory": {
      "redis": {
        "url": "redis://${REDIS_HOST:-localhost}:6379/0"
      }
    }
  },
  "environments": {
    "test": {
      "database": {
        "url": "postgresql://${DB_USER:-my-blog-api}:${DB_PASSWORD}@${DB_HOST:-localhost}:5432/${DB_NAME:-my-blog-api}-test"
      }
    }
  }
}
```

```dotenv
NODE_ENV=dev

DB_PASSWORD=my-blog-api
```

With the `docker` module, the generated `docker-compose.yml` of a PostgreSQL, MySQL, or SQL Server project runs the
database server (and Redis, with the `redis` module) on their default ports (`5432`, `3306`, `1433`, and `6379` for
Redis), also published on the host, with the `.env` credentials. So `docker compose up` runs the whole stack, while
`docker compose up -d postgres redis` and `npm run dev`
run the app locally against the same containers. The application containers read `.env` and set only `DB_HOST` and
`REDIS_HOST` to the service names, which the URLs default to `localhost` without. To use another server, change the
URL in `appweaver.json`, or set `DB_HOST` / `REDIS_HOST` in `.env`. Setting `DB_NAME` renames the database (the test
database is `${DB_NAME}-test`), also in the docker-compose database service, and `DB_USER` changes the user. For MySQL,
the generated `database/mariadb-init.sh` grants the user every database when the MariaDB container initializes its
volume, since Prisma Migrate creates a shadow database and the end-to-end tests the `-test` one.

The migrations connect with `database.migrationUrl`, `database.url` when not set, so the application can query the
data as a user that only reads and writes the rows, while the migrations run as the owner of the tables. `weaver
migrate` also sets up the TimescaleDB hypertables and the PostGIS geometry triggers with it (see
[database](./references/database.md#separate-migration-and-application-users)).

A SQLite project keeps its database file in the `data/` directory (`file:./data/<name>.db`), which the
generated `docker-compose.yml` mounts as the `sqlite-data` volume shared by the migration, seed, and application
containers.

The generated `Dockerfile` builds the application and its production dependencies in a build stage, so the final image
carries no build tools. The image runs as the unprivileged `node` user (`bun` for Bun) and defaults to `NODE_ENV=prod`.
It declares no health check, which belongs to the orchestrator: point the Docker Compose `healthcheck` or the Kubernetes
probes at `GET /health/ready`, which answers `{ "ready": true }` once every service has started (503 with
`{ "ready": false }` before, and again from the start of the shutdown) and needs no authentication. The
`docker-compose.yml` services read `NODE_ENV` from `.env`, so the environment a container starts
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
npx @appweaver/create BunApp "Bun application with simple API" --bun --database sqlite
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
`npm install` skips the native builds and `weaver generate` fails. It also denies (`false`) `@parcel/watcher`, which
Jest pulls in with prebuilt binaries, so its fallback native build is never needed. To approve a newly added
dependency, run `npm install-scripts approve <pkg>`, or `npm deny-scripts <pkg>` to silence the warning for one that
does not need its script; both write the entry to the root `package.json`. Note that a `package.json`
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

const app = await createApp({ autoStart: false, scanPath: './dist/my/app/path' });

// custom init logic...

await app.start(); // with SERVER_LISTEN=false, every service starts without the server listening
```

`app.server` is the Fastify instance of the `HttpServer` service (`inject(HttpServer).instance`), and `app.spec()`
returns the OpenAPI document. `@appweaver/web` adds both to `Application`, so neither is available when the module is
not installed or disabled.

### Modules and application kinds

Every part of the framework is a module declared with `defineModule`: `@appweaver/core` (always), `@appweaver/data`
(Prisma, the resources), `@appweaver/web` (the Fastify server, authentication, requires data) and one driver package
per library or service (`@appweaver/redis`, `@appweaver/bullmq`, `@appweaver/cron`, `@appweaver/nodemailer`,
`@appweaver/twilio`, `@appweaver/handlebars`, `@appweaver/sharp`). Every package but core is enabled by being a
dependency of the application's `package.json`, and carries the library it wraps, so install `@appweaver/redis`, not
`ioredis`. The
`provider` key of each contract (`auto` by default) picks the driver of an enabled module, `none` turns the contract
off. An application adds its own modules in `src/modules/<name>/module.ts` (`weaver module new <name>`) or as npm
packages (`weaver module add <package>`), and a module package is created with `npm create @appweaver module
<package>`, its driver tested with the contract suites of `@appweaver/testing`. See [modules.md](references/modules.md)
and the [providers](references/configuration.md#providers).

| Application                  | How                                                                                                                                      |
|------------------------------|------------------------------------------------------------------------------------------------------------------------------------------|
| HTTP API                     | The default: `createApp()` starts the server on `SERVER_PORT`.                                                                           |
| Queue worker, scheduled jobs | `APP_MODULES_DISABLED=@appweaver/web`: no server, kept alive by its workers or cron jobs. `HEALTH_CHECK_PORT` answers the health checks. |
| One-shot task                | `weaver run <task> [args...]`: runs a `createTask` of `src/tasks/` by its name (`weaver run` lists them), then exits.                    |

```ts
// src/tasks/orders/count.ts, run with `weaver run orders:count Pending`
import { createTask, injectService } from '@appweaver/core';

export default createTask({
  description: 'Counts the orders of a status.',
  arguments: { status: { required: true, choices: ['Pending', 'Paid'] } },
  options: { min: { type: 'number', default: 1 } }, // --min <min>
  run: async ({ args, options }) => {
    const count = await injectService('Order').count({ status: args.status });
    console.log(`${count} orders`);
    return count >= options.min ? 0 : 1; // the exit code
  }
});
```

`weaver run` runs the task without the server or the scheduled jobs, `--help` showing its arguments. A task is named by
its path in `src/tasks/` (`orders/count.ts` is `orders:count`) unless it has a `name`. See
[cli.md](references/cli.md#weaver-run).

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
- Prefer storing configuration in JSON file (`appweaver.json`) over environment (`.env`) file, but keep secrets in
  `.env`
  and reference them from the JSON file as `${VAR}` (i.e. `"url": "postgresql://${DB_USER:-app}:${DB_PASSWORD}@..."`)
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
import { createModel } from '@appweaver/data';

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

A field to hide everywhere is `hidden`. One to hide only where a relation shows it, i.e. the email of the author of a
public post, goes into the `omit` of that relation's `output` (`output: { type: 'always', omit: ['email'] }`), which
leaves it out of the routes, the MCP tools and the realtime events while the related model's own routes keep it.

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

With `storage.versions.enabled` (off by default), uploading a file again keeps the replaced one as a previous version:
a single file field always does, an array field for a file named by a `<field>:replace` multipart text part. A previous
version is served only by the current file's name with `?version=<n>`, listed by `GET /:id/file-versions?name=` and
deleted by `POST /:id/delete-file-versions` (deleting the `latest` one restores the previous one), kept up to
`maxCount` (default `10`) and `maxAge` (unlimited by default), overridden per field by `versions` (`false` for none).
See [storage.md](references/storage.md#file-versions).

The `series` section declares fields measured over time (`float`, `int`, `boolean`), whose points belong to a resource
and live apart from its record: in the `<Model>Series` table of the database (`database`, every database), or a
TimescaleDB hypertable on PostgreSQL (`timescale`). They are written and queried through the
series routes (`POST /:id/series`, `GET /:id/series?bucket=1h&aggregate=avg`, `POST /series/query`) and the
`TimeSeriesService`, directly or through the queue (`seriesOptions.ingest`):

```ts
series: {
  temperature: { type: 'float', minimum: -50, maximum: 150 },
  online: { type: 'boolean' }
},
seriesOptions: { ingest: 'queue', retention: '365d', compressAfter: '30d' }
```

See [timeseries.md](references/timeseries.md) for the stores, the ingestion, the routes, the policies and the service.

The `geo` section declares fields holding GeoJSON geometries (`point`, `multiPoint`, `lineString`, `multiLineString`,
`polygon`, `multiPolygon`, `geometry`), written and read like scalars (a point also as `{ lat, lng }`), and filtered
with the operators `_near` (meters), `_within`, `_withinBox`, `_intersects` and `_exists`. A record matched by `_near`
carries its distance as `<field>Distance`, and sorting by the geo field orders by it. `_near`, `_within` and
`_intersects` are matched by PostGIS on PostgreSQL (`spatial.provider: postgis`, the default there, needing PostGIS on
the server) and by the application on every other database (`database`):

```ts
geo: {
  location: { type: 'point' },
  deliveryArea: { type: 'polygon', required: false }
}
// filter: { location: { _near: { point: { lat: 45.8, lng: 15.97 }, maxDistance: 5000 } } }, sort: 'location'
// items[0].locationDistance → 412.7
```

See [spatial.md](references/spatial.md) for the values, the operators, the providers and their limits.

#### Creating a resource service

Resource service defines the business logic layer for a resource: lifecycle hooks (before/after create, update, delete),
custom data access behavior, and text search configuration. The exported service is automatically invoked by the CRUD
route handlers to perform database operations for a bound model and trigger side effects.

```ts
// src/resources/product/service.ts
import { createService } from '@appweaver/data';

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
`afterUpdate: (product, previous) => { ... }`. The update hooks also run for `replace` (`PUT`).

#### Creating the resource routes

Resource routes define which CRUD endpoints are exposed for a resource and how they behave: the base URL path,
per-operation role and permission requirements, caching settings, rate-limiting, and which operations to include or
exclude. The exported routes are registered automatically on application start and derive their request/response schemas
from the resource model.

```ts
// src/resources/product/routes.ts
import { createRoutes } from '@appweaver/web';

export default createRoutes({
  modelName: 'Product',
  // Applied to every route, unless the route sets the option itself
  defaults: {
    roles: ['Admin', 'User']
  },
  find: {
    cache: true,
    rateLimit: {
      max: 100
    }
  },
  query: {
    cacheTTL: 5000,
    // Also serve GET /products/query
    method: 'get-post'
  },
  create: {
    permissions: ['product:create']
  },
  delete: {
    exclude: true
  }
});
```

The `method` option of `query` and `aggregate` (`post` by default, `get`, or `get-post`) registers a GET route taking
the criteria as query parameters. The defaults come from the `RESOURCE_QUERY_METHOD` and `RESOURCE_AGGREGATE_METHOD`
config (see `references/resources.md`).

The `update` config covers both `PATCH /:id` (partial update) and `PUT /:id` (full replace: required fields must be
present, omitted ones reset to their `default` or `null`). The `replace` config inherits it and overrides it for
`PUT /:id` only (i.e. `replace: { roles: ['Admin'] }` or `replace: { exclude: true }`). Likewise the `update`
`omit`/`pick` of the model shapes the input of both routes, so they always accept the same fields.

The bulk routes (`POST`, `PATCH`, `PUT`, `DELETE` on `/bulk`) are disabled by default. Enable them globally with
`RESOURCE_BULK_*_ENABLED`, or per resource with `bulkCreate`/`bulkUpdate`/`bulkDelete: { exclude: false }`
(`bulkUpdate` enables `PUT /bulk` too, which `bulkReplace` configures on its own). Each
request runs all items in one transaction, all or none, and responds with the array of created, updated, or deleted
records, like its single route, or only with `{ success, count }` when `RESOURCE_BULK_RETURN_RECORDS` or the route's
`returnRecords` is `false` (see `references/resources.md`).

#### Creating a resource policy

Resource policy defines row-level security for a resource: dynamic access checks against individual resource instances,
read restrictions that filter which records are visible to the requester, and file access control. The service layer
evaluates the exported policy on every CRUD operation to enforce fine-grained authorization beyond a static role or
permission checks.

```ts
// src/resources/product/policy.ts
import { createPolicy } from '@appweaver/data';

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
policies.

Wrap several service calls in `runTransaction(async () => ...)` (optionally with an isolation level first) to commit
or roll them back together.

#### Creating an authentication model and service

Use `createAuthModel` and `createAuthService` instead of `createModel`/`createService` when the resource represents an
authenticatable user. They cannot be used independently! If an auth model is created, then also auth service must exist.

`createAuthModel` extends the config with: `email`, `passwordHash`, `verifiedEmail`, `phone`, `verifiedPhone`,
`enabled`, `logoutAt` scalars; a virtual `password` field (write-only); a `roles` relation; a `twoFactorMethods`
relation (while 2FA is enabled, managed by the 2FA routes only); and an optional `apiKeys` relation (when
`SECURITY_API_KEY_ENABLED` is set). An API key acts as its owner, or within the `roles` and `permissions` it
lists,
a subset of its owner's (`AUTH_API_KEY_PERMISSION_DENIED` otherwise), narrowed on every request; see
[security.md](references/security.md#api-key-scope). A declared `email` overrides only its `hidden`, `redact`,
`example`, `minLength`, `maxLength` and `pattern` (it stays the required unique address the sign-in looks the user up
by), a declared `phone` only its `unique`, `hidden`, `redact` and `example` (the routes never write it, the phone
verification does),
and any other auth field replaces a declared one of the same name.

`createAuthService` extends the config with automatic password hashing on create/update, an optional
`registrationData` callback to customize registration payload (for OAuth2 logins its `additionalData` argument includes
`firstName`, `lastName`, `avatarUrl`, and a downloaded `avatarFile` unless `SECURITY_OAUTH2_FETCH_AVATAR_ENABLED` is
turned off), an optional `registrationFiles` callback that maps the model's file fields to files stored right after
the user is created (the avatar included, since a file must be linked to an existing resource), and an optional
`checkOAuth2User` callback invoked before a user is registered or authenticated via OAuth2 (return nothing to proceed,
or a string, an `Error`, or an `AppweaverError` to abort the login, the last one thrown as it is).

```ts
// src/resources/user/model.ts
import { createAuthModel } from '@appweaver/data';

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
import { createAuthService } from '@appweaver/data';

export default createAuthService({
  modelName: 'User',
  registrationData: (_, email, password) => ({ email, password, roles: [1, 2] }),
  registrationFiles: (_, data) => ({ avatar: data?.avatarFile })
});
```

The create and update inputs of an auth model include its `roles`, `password`, and `enabled` fields, so a project
scaffolded with `web` lets only the `Admin` role create, update, delete, and change the files of users through the
`User` routes, and
signs new users up with the `User` role. A policy on the auth model applies only to the API routes: the framework's own
sign-up, logout, password change, and 2FA flows run with `withoutPolicies`, so a policy never blocks them.

Two-factor authentication, off by default (`SECURITY_ACCOUNT_2FA_ENABLED`), offers three methods per user, `Email` and `Sms` codes and an authenticator app (`Totp`),
each enabled, ordered and disabled by the user with the `/auth/account/2fa` routes; the first one is their default. A
sign-in of a user with a method (or of every user with `SECURITY_ACCOUNT_2FA_FORCED`) returns the tokens of the `2fa`
scope with `twoFactorMethods`, passed by `POST /auth/account/2fa/challenge { method? }` and
`POST /auth/account/2fa/verify { challengeId, code }`, then `POST /auth/exchange-token`. The SMS method needs a phone
number verified with `/auth/account/send-verify-phone` and an SMS sender (`@appweaver/twilio`), the TOTP method the
`SECURITY_ACCOUNT_2FA_TOTP_ENCRYPTION_KEY`. A user who lost their methods signs in once per code with the recovery codes
of `POST /auth/account/2fa/recovery-codes` (challenge `method: 'Recovery'`). A route that needs a missing feature is not
registered, so the OpenAPI spec lists only the usable ones: the email verification and password reset need a mailer,
the phone verification an SMS sender, the 2FA routes 2FA enabled, and `/auth/exchange-token` an OAuth2 provider or 2FA. See
[security.md](references/security.md#two-factor-authentication-2fa).

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
- **Limits**: at most `resource.filterMaxConditions` conditions, `filterMaxDepth` levels and `filterMaxListValues`
  values in a list, else `400 RESOURCE_FILTER_TOO_COMPLEX`; the fields a relation `omit`s from its output cannot be
  filtered or sorted on through it.

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
`size` (default `50`), `sort` (default `-createdAt`), `cursor`, and `totalCount` (default `false`, bounded by
`resource.countLimit`; ask for it on the first page only). An offset beyond `resource.maxOffset` is refused, page deeper
with the cursors.

Filters are typed by `QueryFilter<T>` from `@appweaver/common`, and `weaver generate` emits a
`<Model>Query = QueryFilter<Model>` alias per model. Over HTTP, they are validated against a generated per-model
`<Model>QueryFilter` JSON schema, which rejects unknown and hidden fields with a `400` `VALIDATION_FAILED` error.

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
rejected with a `RESOURCE_INVALID_SORT` error (400). Sort inputs are typed by `QuerySort<T>` from `@appweaver/common`,
with a `<Model>Sort`
alias emitted per model and validated over HTTP against a generated `<Model>QuerySort` JSON schema. The default is
`-createdAt`, and every sort is terminated with the primary key so paging stays deterministic.

### Aggregating

`aggregate` takes a single options object, the same shape as the `POST /aggregate` body: `select`, `filter`,
`dateField` (default `createdAt`), `from`, `to`, `step`, and `safeIncrement`. The required `select` holds the operators
to apply per field. Only the numeric fields (`count`, `sum`, `avg`, `min`, `max`, `first`, `last`), the date fields (all
but `sum` and `avg`), and the numeric `id` and audit fields of the model can be aggregated:

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
support, an empty selection, or a `dateField` that is not a date field is rejected with a `RESOURCE_INVALID_AGGREGATE`
error (400). Selections are
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
caching, and the bot checks (`recaptcha`/`recaptchaAction` for reCAPTCHA, `turnstile`/`turnstileAction` for Cloudflare
Turnstile). When a custom route's 2xx response schema references resource output models (`<Name>`, `<Name>Single` or
`<Name>Multiple` — directly or nested inside custom schemas), virtual field values (e.g. `File.url`) are projected onto
the response payload automatically before serialization.

Route and model schemas are written with [TypeBox](https://github.com/sinclairzx81/typebox) (`@sinclair/typebox`), a
dependency of every scaffolded project at the version the framework uses, which `weaver upgrade` keeps in step.

Request validation is strict: a `body`, `querystring` or `params` property the route schema does not declare is
rejected with `VALIDATION_FAILED` (`rule: "additionalProperties"`, `message: "is not allowed"`), never silently dropped.
Every object schema declaring `properties` is closed, unless it sets `additionalProperties` itself, so an object meant
to accept arbitrary keys sets `additionalProperties: true`. The members of a `Type.Intersect` (an `allOf` of several
schemas) stay open, and `headers` are never closed.

```ts
// src/plugins/custom-route.ts
import { registerRoute, Router } from '@appweaver/web';
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

### Rendering templates and translating

The `templates/` files render emails, HTML pages, XML documents or any text, and the `locales/<locale>.json` files
translate keys anywhere in the application. The two are independent: templates render without translation files, and
translations work without the template engine. The application always gives the locale (a request parameter, a user
field,
...), falling back to `LOCALE_DEFAULT`. A template named `exports/orders.xml` is the file
`templates/exports/orders.xml.hbs`, and `templates/exports/orders.de.xml.hbs` is its `de` variant.
See [templates.md](references/templates.md).

```ts
import { TemplateEngine, templateContentType } from '@appweaver/common';
import { EmailService, inject, LocaleService } from '@appweaver/core';

// Any format, i.e. an XML document returned by a custom route
const xml = await inject(TemplateEngine).render('exports/orders.xml', { orders }, { locale });
reply.type(templateContentType('exports/orders.xml')).send(xml);

// An email of the emails/order-shipped.{html,subject}.hbs templates, its text derived from the HTML
await inject(EmailService).sendEmail({ to, template: 'emails/order-shipped', data: { order }, locale });

// A translated string, i.e. in a service hook
inject(LocaleService).translate('inbox.unread', 'de', { msg_cnt: 3 });
```

A translation is an ICU MessageFormat message in a JSON file of nested objects, translated by its dotted key
(`inbox.unread`), with plural forms by the CLDR categories of the locale: `{ "inbox": { "unread": "You have {msg_cnt,
plural, =0 {no unread messages} one {# unread message} other {# unread messages}}" } }`.

Inside the templates, `{{t "key" name=value}}` translates into the rendered locale, layouts and components are partials
(`{{#> layouts/page.html}}...{{/layouts/page.html}}`), and `formatDate`, `formatNumber`, `formatCurrency` format in the
locale. The account emails (verification, password reset, 2FA) render the `emails/*` templates of the application,
scaffolded by `@appweaver/create`, or without them are sent as plain text of the `emails.*` translations.

An email's `from` overrides the sender of the `mailer` config, see [the sender](references/mailer.md#the-sender).

To check a template while editing it, enable `template.preview.enabled` in the `dev` environment: `GET
/templates/emails/order-shipped.html?_locale=de&order.number=WS-1` renders it with the query parameters as its data
(dotted names nest, `_data` takes a JSON object). It is open without authentication unless `template.preview.auth` is
`true`. See [templates.md](references/templates.md#previewing-templates).

### Handling errors

Services, policies, hooks, jobs and workers throw an `AppweaverError` subclass carrying a stable `code` (the `ErrorCode`
enum of `@appweaver/common`) and typed `details`, never an HTTP status. Only the API layer maps the code to a status and
responds with RFC 9457 problem details (`application/problem+json`), i.e.
`{ type, title, status, code, detail, instance, requestId, errors, details }`. A schema validation failure responds with
`VALIDATION_FAILED` and its invalid `errors`, and a database constraint violation with a `DATABASE_*` code naming the
violated fields, i.e. `DATABASE_UNIQUE_VIOLATION` (409) for a taken email, so there is no need to look a value up
before creating a record.

```ts
import { ApplicationError, ErrorCode } from '@appweaver/common';
import { defineErrors, ResourceError } from '@appweaver/common';
import { errorResponses } from '@appweaver/web';

// A module of its own, imported where the codes are used
export const ShopErrors = defineErrors({
  OutOfStock: { status: 409, title: 'Product out of stock' }
});

throw new ResourceError(ErrorCode.ResourceNotFound, 'Order not found', { model: 'Order', id });
throw new ApplicationError(ShopErrors.OutOfStock, 'Only 2 left', { productId });

// The documented errors of a custom route, see the response schema of registerRoute
const response = { 200: Type.Ref('OrderSingle'), ...errorResponses(ShopErrors.OutOfStock) };
```

Use the framework class that fits (`ResourceError`, `RequestError` for invalid input, `AuthError`, `FileError`, ...),
and an `ApplicationError` with a code registered by `defineErrors` for a business rule of the application. Never throw a
plain `Error` for an expected failure, it responds with `INTERNAL_ERROR` (500). Translate the errors of a direct Prisma
call with `toDatabaseError(e, 'Model')`.

### Logging

Log with a named logger, `createLogger('billing')` of `@appweaver/common`, so `log.levels.billing` can set its level
apart from `log.level`. A module lists the names of its loggers in the `loggers` of its manifest, so
`appweaver.schema.json` suggests them in `log.levels`. The application chooses its own levels: `info` for the behavior
worth seeing in the
production logs (a scheduled job's result, an order placed), `debug` for the details of how it got there. See
[logging.md](references/logging.md) for the levels the framework logs at, its loggers and the config.

### Telemetry

The framework records OpenTelemetry traces and metrics on its own: the HTTP requests, the database operations, the
queue jobs (in the trace of their sender), the scheduled jobs, the emails, the text messages and the tasks. They are
exported once the `telemetry` module is added (`weaver module add telemetry`, `@appweaver/opentelemetry`), over OTLP
to the `telemetry.endpoint`, and every log record carries the `trace_id` of its span. Add spans and metrics of the
application with the helpers of `@appweaver/common`, never with a vendor SDK:

```ts
import { currentSpan, telemetryCounter, withSpan } from '@appweaver/common';

const invoices = telemetryCounter('billing.invoices');

currentSpan()?.setAttribute('order.id', orderId); // the span of the request or the job
const pdf = await withSpan('invoice render', { attributes: { 'order.id': orderId } }, () => render(orderId));
invoices().add(1);
```

See [telemetry.md](references/telemetry.md) for what is recorded, the config, the backends (`configureTelemetry`) and
`recordTelemetry` of `@appweaver/testing`.

### Audit log

`audit.enabled` records every request (the user, the client address, the status, the error code) in the `AuditLog`
table and the changed fields of every record the resource services write in `AuditChange`, the passwords and secrets
redacted, both kept for `audit.retention`. The `auth`, `read`, `write`, `changes` and `custom` categories are switched
and kept on their own, the reads off by default. Leave out paths, models and actions with `audit.excludePaths`,
`audit.excludeModels` and `audit.excludeActions`, or a route with `audit: false`, and keep a field's values out with
`redact: true`. Code writing through Prisma directly records its changes with `AuditService.recordChange`. See
[audit.md](references/audit.md).

### Realtime events

With the `realtime` module (`@appweaver/realtime`), clients subscribe over WebSocket or SSE to the channels of the
application and the resource events of the models exposing them, and call custom actions. Nothing is exposed unless
declared, every event is checked against the access of the user, and `public: true` opens a part to anonymous clients
once `realtime.anonymousEnabled` is set:

```ts
export const orderShipped = createChannel({
  name: 'order.shipped',
  payload: Type.Object({ orderId: Type.Integer(), customerId: Type.Integer() }),
  deliver: (user, payload) => payload.customerId === user?.id
});
await orderShipped.publish({ orderId: 7, customerId: 1 });

createRoutes({ modelName: 'order', events: { actions: ['create', { action: 'update', public: true }] } });
createPolicy({ modelName: 'order', events: (user, { current }) => current.customerId === user?.id });
createRealtimeAction({
  name: 'chat.typing',
  payload: Type.Object({ roomId: Type.Integer() }),
  handler: ({ roomId }, { user }) => typing.publish({ roomId, userId: user!.id })
});
```

To stream chunks rather than events (the tokens of an LLM answer, bytes), use a **streaming action** for the caller
alone, or `createStream` for the subscribers of a key. A subscriber is checked once, never per chunk, and a chunk
reaches another instance only while one of them has a subscriber:

```ts
createRealtimeAction({
  name: 'assistant.prompt',
  payload: Type.Object({ prompt: Type.String() }),
  stream: { codec: 'text', coalesce: 16 },
  async *handler({ prompt }, { signal }) {
    for await (const token of llm.stream(prompt, { signal })) yield token; // signal: cancelled or client gone
  }
});

export const roomAnswer = createStream({ name: 'room.answer', subscribe: (user, _, key) => isMember(user, key) });
const writer = roomAnswer.open(roomId);
writer.write('Hello');
writer.end();
```

An action with `input` receives the chunks a client streams over the WebSocket (`context.input`, paced by credits),
i.e. the audio of a microphone. A stream with `resource: { model }` lets subscribe only the users able to `find` the
record of the key, so the policy of the model decides. A logout, a disabling or a lost role ends the calls of a user at
once (their `signal` aborts), over HTTP too.

On a rolling update an instance drains: it moves its clients to the other instances (`1012`), relays the streaming
actions they resume there until they end, and waits for its calls at most `realtime.shutdownGracePeriod`.

The generated client calls `client.realtime.subscribe`, `on`, `send`, `emit`, `call` (a streaming action, an async
iterable of its chunks, with `call.input` or `{ input }` for an input) and `stream`. See
[realtime.md](references/realtime.md).

### AI models

With the `ai` module (`@appweaver/ai` and `@appweaver/openai`), `AiService` calls the models of the endpoints of the
`ai` config: any OpenAI-compatible server (Ollama, LM Studio, OpenRouter, OpenAI, ...), all usable at once. A model is a
reference `<endpoint>:<model>` (`local:qwen3:8b`) or an alias of `ai.aliases` (`fast`, any name), so each environment
picks its models (the built-in `mock` endpoint in tests):

```ts
const ai = inject(AiService);
const { text } = await ai.generate({ model: 'fast', system: 'Be brief.', prompt: question });
for await (const delta of ai.stream({ prompt: { template: 'prompts/answer', data } })) send(delta);
const { object } = await ai.generateObject({ prompt: ticket.body, schema: TicketTriage });
const label = await ai.classify(ticket.body, ['bug', 'billing']);
await ai.generate({ prompt: 'Where is order 42?', tools: [getOrder] }); // createAiTool, run as the user
await ai.generateQueued({ prompt: 'Summarize ...' }); // through the `ai` queue, on any instance
```

A stream is an async iterable of text: a streaming realtime action returns it, `pipeAiStream` writes it into a
`createStream` writer, `aiEventStream` into an SSE response. See [ai.md](references/ai.md).

### MCP server

With the `mcp` module (`@appweaver/mcp`), AI agents call the application over the Model Context Protocol at
`POST /mcp`, authenticated like the API (JWT, API keys) and running as that user, so the policies apply. Nothing is
exposed unless declared: resource actions with the `mcp` key of `createRoutes`, custom tools with `createMcpTool`.
`update`, `delete` and tools marked `destructive` also need `mcp.destructiveEnabled`:

```ts
createRoutes({ modelName: 'post', mcp: { actions: ['find', 'query', 'create'], exclude: ['note'] } }); // the access of the API routes
createMcpTool({
  name: 'refundOrder',
  input: Type.Object({ orderId: Type.Integer() }),
  roles: ['support'],
  destructive: true,
  handler: ({ orderId }) => refunds.refund(orderId)
});
```

`mcp.cache.enabled` caches the read-only tool results per user, `mcp.rateLimit.enabled` limits the tool calls per
user, and `mcp.oauth2.enabled` lets the MCP clients sign their users in by themselves (OAuth discovery, dynamic
client registration, PKCE) through the OAuth2 providers of `security.oauth2`. See [mcp.md](references/mcp.md).

### Registering a custom model

Use `registerModel` to register a custom [TypeBox](https://github.com/sinclairzx81/typebox) schema as a named model.
Registered models are added to the schema registry and can be referenced by `$ref` in route schemas.

```ts
// src/plugins/custom-model.ts
import { registerModel } from '@appweaver/web';
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
import { registerPlugin } from '@appweaver/web';

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

define(MyCacheService, Cache); // register class under abstract token
define('https://api.example.com', 'ApiBaseUrl'); // register plain value

const cache = inject(Cache); // resolves singleton instance
const url = inject<string>('ApiBaseUrl'); // resolves by string token
```

The infrastructure providers (`Storage`, `Mailer`, `Queue`, ...) are defined by the modules from the `provider` keys,
so `main.ts` never wires them. Inject an optional one with a fallback, or check it first:

```ts
import { Mailer } from '@appweaver/common';
import { inject, isDefined } from '@appweaver/core';

const mailer: Mailer | undefined = inject(Mailer, false); // undefined with MAILER_PROVIDER=none
if (isDefined(Mailer)) { /* ... */
}
```

A registered class setting the static `[LIFECYCLE] = true` tag has its hooks of `@appweaver/common` called:
`onInit()` when the application starts, `onReady()` once every service is initialized, `onShutdown()`
first on stop, and `onDestroy()` last;
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

import { hashPassword, systemConfig } from '@appweaver/data';
import { randomString } from '@appweaver/common';
import { db } from '@db/client';

export async function createAdminUser(): Promise<void> {
  const password = systemConfig.ADMIN_INITIAL_PASSWORD || randomString(16, { extra: false });

  await db.user.create({
    data: {
      firstName: 'Admin',
      lastName: 'Admin',
      email: systemConfig.ADMIN_INITIAL_EMAIL,
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
weaver start --watch                  # development (restarts on source, template and translation changes)
weaver start --project tsconfig.json  # path to tsconfig file
```

### Generate types and schema

```sh
weaver generate                   # everything: types, Prisma schema and config schema
weaver generate --types           # TypeScript types only
weaver generate --prisma-schema   # Prisma schema only
weaver generate --config-schema   # appweaver.schema.json only, no @appweaver/data needed
weaver generate --no-prune        # keep the framework models the project does not use
```

The framework models are generated only when used: `Role`, `Permission`, `ApiKey`, `OneTimeToken` and
`ConnectedAccount` with an auth model, `File` when a model declares `files`, `Seeder` when the seeders directory exists.

### Run database migrations

```sh
weaver migrate                        # run pending migrations, then set up the hypertables and geometry triggers
weaver migrate --dry-run              # print the pending migrations and their SQL, without applying them
weaver migration check                # check if the models need a new migration, print its SQL (exit code 1)
weaver migration new <name>           # create a new migration
weaver migration reset                # reset database (prompts confirmation)
weaver migration reset --yes --force  # force reset, skip confirmation
```

### Seed the database

```sh
weaver seed                                                # run seeders
weaver seed --build-project                                # build project first, then run seeders
weaver seed --build-project --project tsconfig.build.json  # tsconfig file used for the build
weaver seed --continue-on-error                            # continue if a seeder throws error
weaver seed --fix-warnings                                 # fix all warnings like invalid checksum or missing seeder
weaver seed --dry-run                                      # print the pending seeders, without running them
```

### Generate OpenAPI specification

```sh
weaver openapi                                         # generate schema to ./openapi.json
weaver openapi --output-path ./generated/openapi.json  # generate schema to a custom path
weaver openapi --format yaml                           # generate schema in yaml format (./openapi.yaml)
```

### Inspect the configuration

```sh
weaver config schema               # JSON Schema of appweaver.json from the enabled modules (./appweaver.schema.json)
weaver config print                # every key with its source (override, env, json, default), the secrets hidden
NODE_ENV=prod weaver config check  # validate every section, exit 1 listing the invalid keys (run in CI)
```

The `$schema` of `appweaver.json` points to `./appweaver.schema.json`, which `weaver generate` writes from the config
sections the enabled modules list (rerun it after adding a module), and `weaver config schema` also for a section of an
application file outside a module. See
[configuration.md](references/configuration.md#inspecting-the-config).

### Run a one-shot task

```sh
weaver run                              # list the tasks of src/tasks/ and the modules
weaver run orders:count Pending         # run a task by its name with the arguments, then exit
weaver run orders:count --help          # the arguments and options of a task
```

### Upgrade Appweaver packages

```sh
weaver upgrade                                 # upgrade all @appweaver/* packages to latest
weaver upgrade @appweaver/core @appweaver/cli  # upgrade specific packages
weaver upgrade --target-version 1.2.3          # upgrade to a specific version
weaver upgrade --no-skill                      # skip upgrading AI agent skill files (.claude, .agents, …)
weaver upgrade --force                         # force upgrade despite peerDependency mismatches
weaver upgrade --no-companions                 # skip the companion packages (prisma, typebox, typescript, …)
weaver upgrade --tooling                       # also upgrade the tooling packages (eslint, jest, prettier, …)
weaver upgrade --dry-run                       # print the upgrades without installing them
weaver skill sync                              # copy the installed @appweaver/skill into the agent directories
```

After the install, `weaver upgrade` runs `weaver skill sync`, which copies the skill of the project's `@appweaver/skill`
dev dependency into `skills/appweaver/` of every agent directory (`.claude`, `.agents`, `.github`, …); run it alone after
installing the package by hand. Besides the `@appweaver/*` packages, `weaver upgrade` bumps the companion packages the project already has (Prisma
and its adapters, TypeBox, TypeScript) to the exact versions the target release is built with. It never adds missing
packages or downgrades newer ones. The libraries of the drivers (BullMQ, Cron, Handlebars, IoRedis, Nodemailer, Sharp)
come with their `@appweaver/*` driver packages. Run `weaver generate` afterwards when Prisma is upgraded.

### Managing modules

The optional modules of `@appweaver/create` are added to and removed from an existing project with the same templates,
of the version the project's `@appweaver/cli` is at:

```sh
weaver module list                     # the modules, whether enabled, their packages and requirements
weaver module add redis queue docker   # add modules with the modules they require, and install them
weaver module add sms                  # the Twilio SMS sender, logging the messages in dev and test
weaver module add web --database mysql # add the server and the database (data) it requires, on MySQL
weaver module add templates --dry-run  # print the files and configuration it would change
weaver module add docker --force       # overwrite the existing files instead of skipping them
weaver module remove docker            # remove modules (alias: rm), deleting their files
weaver module remove mailer --no-install
weaver module add @acme/appweaver-gcs  # install a module package (no install scripts), print its providers
weaver module new audit-log            # create the local module src/modules/audit-log/
```

A module is enabled when the project depends on its packages (`locales` and `docker` when `locales/` and `Dockerfile`
exist, `timeseries` when `appweaver.json` sets `timeseries.provider`). `add` writes the module's packages into `package.json`, its values into `appweaver.json`, its files (skipping
the existing ones that differ), and what it adds to the enabled modules: the database, migrations and seed services and
the Redis service of `docker-compose.yml`, the server port and health check, the Dockerfile `COPY` of the public,
template, translation and Prisma files, the email templates and texts of the mailer. `data` is added on the database of
`--database` (`sqlite` by default), with its password in `.env` and `.env.example`. Adding `locales` restores
the `t` calls of the scaffolded templates that still hold the English texts.

`remove` reverts all of it and deletes the module's files: the whole `templates/` or `locales/` directory, the Docker
files, the mailer's email templates and its unchanged `emails` texts of `locales/en.json`. Removing `locales` first
writes the English texts of `locales/en.json` into the
templates, so they keep rendering (the other languages are lost). A module another enabled module requires cannot be
removed alone (`queue` requires `redis`, `web` requires `data`). Removing `data` deletes the whole `database/`
directory and the generated types. An `appweaver.json` value changed in the project is kept, and the only files of
`src/` and `database/seeders/` touched are the scaffolded ones of `web` (the `User` resource and its admin seeder),
deleted only while unchanged, so remove the code using a removed module yourself.

A name that is not a scaffold module, with a scope, a `-` or a `/`, is a module package: `add` installs it with
`npm install --ignore-scripts` (`bun
add` on Bun) and prints the providers and requirements of its manifest. `new <name>` creates a local module (kebab-case
name) with its `module.ts`, `config.ts` (the camelCase section of the name) and `main.ts`, enabled without config. A
reusable module goes into a package of its own, created with `npm create @appweaver module <package> -- --contract
storage|mailer|sms|none`, i.e. a Postmark mailer or a Vonage SMS sender (see
[modules.md](references/modules.md#creating-a-module-package)).

### Run tests

```sh
npm run test                 # weaver test --coverage: the unit tests with coverage
npm run e2e                  # weaver test --e2e: the e2e tests
weaver test test/unit/a.test.ts --watch   # one file, again on every change
```

`weaver test` runs the Jest of the `@appweaver/tooling` dev dependency on Node (the `"preset": "@appweaver/tooling"` of
`jest.config.json`: SWC, the JUnit report of `reports/`), and `bun test` on Bun. The lint, the format and the test tools
come with `@appweaver/tooling`: never add ESLint, Prettier, Jest or SWC to the project yourself.

Test files must use the **`.test.ts`** extension. Place unit tests in `test/unit/` and end-to-end tests in `test/e2e/`,
naming each file after its module. Add or update tests whenever a feature is added or existing behaviour changes.

The e2e setup and teardown are wired automatically, but **each e2e test file must register the per-file database reset
itself**, after the hook that stops the application:

```ts
import { resetTestData } from './support/reset';

describe('My e2e test', () => {
  let app: Application;

  beforeAll(async () => {
    // The test environment sets server.listen to false, so app.server.inject() serves the requests
    app = await createApp();
  });

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);
});
```

The reset drops the whole test database, so the e2e files run one at a time: keep `"maxWorkers": 1` in
`test/e2e/jest.e2e-config.json`. Run in parallel, the reset of one file drops the tables, the migrations table included,
under a file still running or resetting beside it (`P1014 The underlying table for model _prisma_migrations does not
exist` on a database server).

**AI agents and dangerous database actions.** Prisma refuses a database reset by an AI agent when
`DATABASE_AI_DANGEROUS_ACTIONS_ENABLED` is `false`. **Never change it yourself or get past the refusal another way**,
stop and ask the user to run the command.

### Format code

```sh
npm run format          # weaver format: prettier --write "./**/*.ts"
weaver format --check   # check without writing
```

The Prettier config is `"prettier": "@appweaver/tooling/prettier"` of `package.json`.

### Lint code

```sh
npm run lint        # weaver lint: eslint .
weaver lint --fix   # fix what can be fixed
```

`eslint.config.mjs` exports `eslintConfig({ rootDir: import.meta.dirname })` of `@appweaver/tooling/eslint`, the
recommended rules of ESLint 10 and the type checked typescript-eslint; extend the array it returns with the rules of the
project.

## References

- Application CLI (weaver): [cli.md](references/cli.md)
- Application configuration: [configuration.md](references/configuration.md)
- Logging & log levels per module: [logging.md](references/logging.md)
- Modules & providers: [modules.md](references/modules.md)
- Application resources: [resources.md](references/resources.md)
- Dependency injection: [dependency-injection.md](references/dependency-injection.md)
- Security details, API keys and their scope: [security.md](references/security.md)
- Storage & File management: [storage.md](references/storage.md)
- Database & Migrations: [database.md](references/database.md)
- Events & Hooks: [events.md](references/events.md)
- Realtime channels, resource events, actions & streams (WebSocket, SSE): [realtime.md](references/realtime.md)
- AI models, streams, objects, tools & embeddings: [ai.md](references/ai.md)
- MCP server of the AI agents: [mcp.md](references/mcp.md)
- Cache management: [cache.md](references/cache.md)
- Queue jobs: [queue.md](references/queue.md)
- Scheduling jobs: [scheduler.md](references/scheduler.md)
- Sending emails: [mailer.md](references/mailer.md)
- Sending text messages (SMS): [sms.md](references/sms.md)
- Templates & localization: [templates.md](references/templates.md)
- Generating an HTTP client for using API: [client.md](references/client.md)
- Errors & error responses: [errors.md](references/errors.md)
- Time series fields, stores & routes: [timeseries.md](references/timeseries.md)
- OpenTelemetry traces, metrics & logs: [telemetry.md](references/telemetry.md)
- Audit log of the requests and the changes: [audit.md](references/audit.md)
- Geo fields & spatial queries: [spatial.md](references/spatial.md)
