# Appweaver Modularization Plan

**Status**: proposal. **Target**: release `2.0.0`, breaking without a migration layer, since the framework has no
external users yet.

## 1. Goals

- An application installs only what it uses: a queue worker runs without the web server, an API without Redis.
- Any kind of application, not only web ones: an HTTP API, a web app without a database, a queue worker, a scheduled
  job runner storing its data in SQLite or Redis, a one-shot task, with the packages combined freely (section 4.1).
- Smaller `node_modules` and Docker images, mostly for workers.
- The first-party modules are built with the same public API as everyone else's, so anything they do, a third-party
  module can do.
- Anyone can publish a module that implements a framework contract (Google Cloud Storage, a Brevo or Mailgun
  mailer, ...) or adds any other feature, with its own validated config in `appweaver.json` and environment variables.
- A new module is scaffolded with one command, as an npm package or as a folder inside an application, and any module
  is added to or removed from an application with one command.

## 2. Current state

### 2.1 Install size

Measured with `npm install --omit=dev` on linux-x64:

| Dependency                                          | Size (MB)  | Needed by                                                                         |
| --------------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| `@prisma/client`                                    | 77         | Every application with a database, but installed by every app today               |
| `fastify` and 12 `@fastify/*` plugins               | 38         | The HTTP server only                                                              |
| `sharp`                                             | 30         | Image processing of uploads only, but loaded by every app (`core/utils/index.ts`) |
| `date-fns`                                          | 28         | Two files: `common/utils/string-util.ts`, `core/resource/utils/aggregate-util.ts` |
| `bullmq` and `ioredis`                              | 14         | The Redis queue, already an optional peer                                         |
| `@fastify/auth`, `basic-auth`, `jwt`, `oauth2`      | 7          | HTTP authentication                                                               |
| `handlebars`, `cron`, `nodemailer`, `csv-stringify` | 6, 5, 2, 1 | Optional peers, except `csv-stringify`                                            |
| `@appweaver/core` itself                            | 1.5        |                                                                                   |

A worker (core, Prisma with the pg adapter, BullMQ) installs **208 MB** today and about **115 MB** after the split and
the replacement of `date-fns`.

### 2.2 Coupling that blocks the split

The modules of `packages/core` import each other in cycles (resource ↔ security ↔ factory, storage ↔ security,
cache ↔ security). The seams to cut:

1. **The auth user depends on Fastify.** It is kept in `@fastify/request-context` (`currentAuthUser()` in
   `security/helper.ts`) and read by the policies (`factory/create-service.ts`), the resource utils, `FileService` and
   the caching plugin, so the data layer cannot run without the server.
2. **The application owns the server.** `Application` takes the `Server` in its constructor and `createApp` always
   calls `createServer()` (`app/create-app.ts`). `context.server` signs the JWTs (`security/auth-service.ts`) and
   registers the schemas (`utils/schema-util.ts`).
3. **Hardcoded wiring.** `app/load-providers.ts` lists every feature service by path, `server/create-server.ts`
   registers `auth`, `caching`, `health`, `templatePreview` and `files` itself, and `@appweaver/core/resources` is
   hardcoded in `resource/resource-loader.ts` and `cli/utils/loader-util.ts`.
4. **The HTTP layer imports security.** `server/register-route.ts`, `resource/resource-schema.ts` and
   `health/health-schema.ts` import `authSchema` and `authErrorCodes`, and `errors/problem.ts` imports `AuthError` and
   `FileError`.
5. **The database is required.** `app/load-providers.ts` loads the `Database` provider as required, the events, the
   cache service and `FileService` import the Prisma transaction context (`database/transaction-context.ts`), and
   `errors/problem.ts` converts the Prisma errors itself, so no application runs without Prisma and a database.
6. **One config schema for everything.** It is parsed when `@appweaver/common` is imported (`common/config/config.ts`),
   its provider defaults point at `@appweaver/core/...` paths, and unknown keys are only kept untyped as
   `_appweaver_<KEY>`. `schema.json` and `config-type.ts` duplicate it by hand.

### 2.3 What already helps

- The infrastructure contracts are abstract classes in `common/infrastructure` (`Database`, `Storage`, `Mailer`,
  `Queue`, `Cache`, `Memory`, `Redis`, `Scheduler`, `Events`, `TemplateEngine`, `SecurityStore`), and the samples
  inject them from `@appweaver/common`.
- Providers are loaded by module path from config (`STORAGE_PROVIDER`, `MAILER_PROVIDER`, ...), the optional ones with
  `required: false`.
- The DI container resolves definitions by name and lazily, and finds the `OnInit`/`OnDestroy` hooks and health checks
  itself.
- `APP_AUTOLOAD_MODULES` already loads the resources of extra packages, at runtime and in `weaver generate`.

## 3. Decision

Split `packages/core` into a small **core**, a **data** package, a **web** package and thin **driver** packages,
released together from the monorepo at one version. Neither keep everything in one package with toggles, nor make a
package of every directory.

| Approach                                            | Examples                                         |
| --------------------------------------------------- | ------------------------------------------------ |
| One package, features enabled by config             | Django, Laravel (drivers are still own installs) |
| Lockstep packages, optional meta package            | Rails, Angular, NestJS, AdonisJS                 |
| Small core plus adapter packages                    | Payload, Medusa, Spring Boot starters            |
| One package with subpath imports and optional peers | Drizzle, Hono                                    |
| One package per tiny module                         | The per-method `lodash.*` packages, abandoned    |

Why not keep one package:

- The decoupling of section 2.2 is needed for apps without a server anyway, and it is most of the work.
- `core/index.ts` re-exports every module, so one package loads Fastify and sharp in every app. Getting the size win
  within one package would turn Fastify, its plugins and sharp into optional peers that every app installs by hand.
- `scaffoldDependencies.companion`, the companion bumps of `weaver upgrade` and their version test exist only because
  core cannot declare `bullmq`, `cron`, ... as dependencies. A driver package declares them.
- Package boundaries rule out import cycles by construction.

Why not a package per directory: locale, cache, export, mailer, template, events, health and seeder are plain
TypeScript without heavy dependencies, used by the other modules. As packages they add release and test cost and save
no size. Only the HTTP stack, the database layer and each heavy third-party library get a package.

## 4. Target packages

| Package                 | Role                                                                     | Third-party dependencies                           |
| ----------------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| `@appweaver/common`     | Contracts, module and config definitions, logger, errors, shared types   | `@sinclair/typebox`, `pino`, `dotenv`, `glob`, ... |
| `@appweaver/core`       | The runtime of every app: context, lifecycle, modules, in-memory drivers | `flatted`                                          |
| `@appweaver/data`       | Database, resources, models, policies, auth data model, file records     | `@prisma/client` (peer), `csv-stringify`           |
| `@appweaver/web`        | The HTTP stack, with authentication                                      | `fastify`, `@fastify/*`                            |
| `@appweaver/redis`      | Redis memory (also the rate limit store of web), cache, security store   | `ioredis`                                          |
| `@appweaver/bullmq`     | BullMQ queue, requires `@appweaver/redis`                                | `bullmq`                                           |
| `@appweaver/cron`       | Cron scheduler                                                           | `cron`                                             |
| `@appweaver/nodemailer` | SMTP mailer                                                              | `nodemailer`                                       |
| `@appweaver/handlebars` | Handlebars template engine and its helpers                               | `handlebars`                                       |
| `@appweaver/sharp`      | Image processing of the uploaded files (`ImageProcessor` contract)       | `sharp`                                            |
| `@appweaver/testing`    | Contract test suites, `createTestApp()`, the shared test fixtures        |                                                    |
| `@appweaver/cli`        | `weaver`, using the module discovery, its database commands need `data`  |                                                    |
| `@appweaver/client`     | Unchanged                                                                |                                                    |
| `@appweaver/create`     | Renamed `create-weaver-app`, with the app and module templates (sec. 10) |                                                    |

**`@appweaver/common`** adds `defineModule`, `defineConfig` and the split config loader to the current contracts,
logger and utils, and takes over `ErrorCode`, every error class and `defineErrors`, so a module without `web` declares
its own error codes too.

**`@appweaver/core`** keeps what every application needs, with neither a database nor a server:

- the DI context, the application lifecycle, the module and provider loading, `weaver run`
- the auth user context with `runAs(user, fn)`, and the transaction scope: an `AsyncLocalStorage` with `afterCommit`
  callbacks and no Prisma types, opened by `data` for its transactions, so the events, the cache invalidation and the
  file deletions still wait for the commit
- the schema registry of `createSchemaModel`, shared by `data` and `web`
- locale, the cache service with the memory cache, the in-memory memory and queue, node events
- `EmailService` with the JSON mailer, and the `local` filesystem driver of `Storage`
- the health service, and the health listener for applications without `web` (section 4.1)

**`@appweaver/data`** takes everything built on Prisma:

- the Prisma `Database` provider, `runTransaction`, `afterCommit`, `injectDatabaseClient`, `toDatabaseError`, and the
  translator of the Prisma errors (section 5)
- the resources: service, loader (`RESOURCE_MODEL_PATTERN`, `RESOURCE_SERVICE_PATTERN`, `RESOURCE_POLICY_PATTERN`),
  filter, sort, aggregate and model schemas
- `createModel`, `createService`, `createPolicy`, `withoutPolicies`, `hasRole` and `hasPermission`
- the auth data model: `createAuthModel`, `createAuthService`, the role, permission, API key, one-time token and
  connected account models, and password hashing
- `FileService` with the File model, keeping the records of the files stored by any `Storage` driver and transforming
  the images with the `ImageProcessor` driver, if any
- the database security store, the CSV export of resources and the seeder

Its models only reach the schema of an app that uses them: the auth tables (role, permission, API key, one-time token,
connected account) with an auth model, the File model with a model declaring `files`, and the Seeder model with a
seeders directory. Today Role, Permission, File and Seeder are always created, and the API key, one-time token and
connected account tables are switched by security config keys that move to `web`, so the models would read the config
of another package. The keys that change the schema belong to `data` instead (section 5).

**`@appweaver/web`** takes:

- the Fastify server, Swagger, `registerRoute`, `registerPlugin` and `registerModel`
- `createRoutes` with the resource routes and their schemas, loading the `RESOURCE_ROUTES_PATTERN` files itself
- the HTTP errors: `errorHttpMap`, problem details, `errorResponses`, and the HTTP status of the codes declared with
  `defineErrors`
- JWT, API key, Basic and OAuth2 authentication with `AuthService`, `AccountService` and `OAuth2Service`, reCAPTCHA and
  Turnstile
- the auth, account, files, health, info and template preview routes
- rate limit, response caching, CORS, Helmet, static files and multipart

Its parts working on resources and users (the resource, auth, account, files and export routes, and the
authentication) load only when `data` is enabled, an optional peer dependency of `web`. Without it, `web` serves the
custom routes, Swagger, health, info and template preview, and a route that is not `public` fails the startup, naming
the route, since nothing could authenticate it.

```
@appweaver/common
└── @appweaver/core
    ├── @appweaver/data
    ├── @appweaver/web           (data optional, for the resources and the authentication)
    ├── @appweaver/redis ── @appweaver/bullmq
    ├── @appweaver/cron
    ├── @appweaver/nodemailer
    ├── @appweaver/handlebars
    └── @appweaver/sharp
```

- The core is what every application needs. Neither the web server nor the database is part of it, so the 77 MB of
  Prisma are installed only by applications with a database. Rails (Active Record), AdonisJS (Lucid) and NestJS (its
  ORM integrations) keep the database out of their core too.
- The HTTP authentication lives in `web`: nearly every API needs it and no worker does. The auth data model lives in
  `data`, so a worker shares the models and the database schema of its API without Fastify.
- The drivers are named after the library they wrap, leaving room for other implementations of the same contract
  (`@appweaver/s3`, `@appweaver/ses`, `@appweaver/pg-boss`). They are 100–300 lines each and rarely change, so their
  count costs little upkeep.
- First-party feature modules added later (payments, audit log, ...) live in `packages/` too, use the module template of
  section 10 and are released with the rest.

### 4.1 Application kinds

Every package except `bullmq` (which requires `redis`) combines freely with the others. A contract without a driver
falls back to its core implementation or stays disabled (section 4.2), and a feature needs only the packages below:

| Feature                                                        | Needs                                                | Without it                                        |
| -------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| Models, resources, policies, seeders, CSV export               | `data`                                               | Not available                                     |
| File records (`files` fields of models, `FileService`)         | `data`, a `Storage` driver (`local` in core)         | `inject(Storage)` stores and reads files directly |
| HTTP routes, Swagger                                           | `web`                                                | No server                                         |
| Resource routes, authentication, account and files routes      | `web`, `data` (an auth model for the authentication) | Only `public` routes                              |
| Emails                                                         | A `Mailer` driver (`smtp`, or `json` selected)       | `EmailService` not defined                        |
| Template emails, HTML pages                                    | A `TemplateEngine` driver (`handlebars`)             | Plain emails only                                 |
| Scheduled jobs                                                 | A `Scheduler` driver (`cron`)                        | Disabled                                          |
| A queue shared by processes, surviving restarts                | `bullmq` (with `redis`)                              | The memory queue of one process                   |
| Memory, cache, rate limit and security store shared by servers | `redis`                                              | Per-process memory                                |
| Image transforms of uploads                                    | An `ImageProcessor` driver (`sharp`)                 | Images stored as uploaded                         |
| Health checks                                                  | The `web` route, or the core listener                | None                                              |

| Application                                  | Packages                                                 | Runs                                       |
| -------------------------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| HTTP API                                     | `core`, `data`, `web`, plus the drivers it uses          | Until stopped                              |
| Web without a database (contact form, relay) | `core`, `web`, `nodemailer`, `handlebars`                | Until stopped, `public` routes only        |
| Queue worker of an API                       | `core`, `data`, `redis`, `bullmq`                        | Until stopped, kept alive by its workers   |
| File processing worker without a database    | `core`, `redis`, `bullmq`, a `Storage` driver (GCS, ...) | Until stopped, kept alive by its workers   |
| Scheduled jobs with SQLite                   | `core`, `data`, `cron`, `@prisma/adapter-better-sqlite3` | Until stopped, kept alive by its cron jobs |
| Scheduled jobs keeping their state in Redis  | `core`, `redis`, `cron`                                  | Until stopped, kept alive by its cron jobs |
| One-shot task                                | `core`, plus what it uses                                | `weaver run <file>`, exits when it is done |

A scheduled job runner storing its data in SQLite:

```jsonc
// package.json
"dependencies": {
  "@appweaver/common": "^2.0.0",
  "@appweaver/core": "^2.0.0",
  "@appweaver/data": "^2.0.0",
  "@appweaver/cron": "^2.0.0",
  "@prisma/adapter-better-sqlite3": "7.9.1",
  "@prisma/client": "7.9.1"
}
```

```ts
// src/main.ts, no server is created since @appweaver/web is not enabled
await createApp();

// src/jobs/index.ts, loaded by APP_SCAN_FILES_PATTERN like today
inject(Scheduler).addJob({
  cronTime: '0 * * * *',
  onTick: async () => {
    await injectService('Reading').create(await fetchReading());
  }
});
```

- Its database schema holds only its own models, plus Seeder with a seeders directory (section 4).
- Policies run without an auth user in jobs: `withoutPolicies(fn)` skips them, `runAs(user, fn)` applies them for a
  user (section 5).
- A container needs a health check without `web`: core answers it on `health.port` (`HEALTH_PORT`, off by default)
  with a small `node:http` listener, the same checks the `web` health route runs.
- `weaver run <file>` creates the application without starting its server or scheduler, runs the default export of the
  file, stops the application and exits with its result, like a Rails runner or an Artisan command.
- `weaver openapi` needs `web`, and `weaver generate`, `migrate`, `migration` and `seed` need `data`, each saying so
  when it is not enabled. `app.spec()` moves to `web`, and the `createApp` options of the server (`autoStartServer`)
  become `web` config.
- The memory fallbacks suit one process. When `auto` falls back to the memory queue in production, the startup logs a
  warning, since its jobs (and so the emails of `EmailService`) are lost on a restart.

### 4.2 Provider names

A provider is selected by name in config (section 6.3). The packages are named after the library they wrap, the
providers after what the user selects, which is also the name of their config subsection:

| Contract         | Core                    | First-party drivers                                          |
| ---------------- | ----------------------- | ------------------------------------------------------------ |
| `Memory`         | `memory`                | `redis` (`@appweaver/redis`)                                 |
| `Cache`          | `memory`                | `redis` (`@appweaver/redis`)                                 |
| `SecurityStore`  | none                    | `database` (`@appweaver/data`), `redis` (`@appweaver/redis`) |
| `Queue`          | `memory`                | `bullmq` (`@appweaver/bullmq`)                               |
| `Scheduler`      | none, disabled          | `cron` (`@appweaver/cron`)                                   |
| `Mailer`         | `json`                  | `smtp` (`@appweaver/nodemailer`)                             |
| `TemplateEngine` | none, disabled          | `handlebars` (`@appweaver/handlebars`)                       |
| `ImageProcessor` | none, images kept as is | `sharp` (`@appweaver/sharp`)                                 |
| `Storage`        | `local` (filesystem)    | none yet (`@appweaver/s3`, ...)                              |
| `Events`         | `node`                  |                                                              |
| `Database`       | none                    | `prisma` (`@appweaver/data`), not pluggable                  |

The database is chosen with a Prisma driver adapter (`@prisma/adapter-better-sqlite3`, `@prisma/adapter-pg`, ...), not
with a module: the resources are built on Prisma, so `Database` is not a contract for third-party drivers.

## 5. Architecture rules

1. `@appweaver/common` and `@appweaver/core` are peer dependencies of every module package, never dependencies, so an
   app has one DI context. The startup fails on a second copy of either. A module using models lists `@appweaver/data`
   as a peer dependency too.
2. All first-party packages share one version and are released together, as today.
3. First-party modules use only the public API: `defineModule`, `defineConfig`, `defineErrors`, the contracts and the
   DI functions. No internal hook exists for them, so a third-party module can do everything they do.
4. Only `@appweaver/web` and the `web` entries of modules import Fastify, and only `@appweaver/data` and the
   `resources` entries of modules import Prisma. A module with such an entry lists the package as an optional peer
   dependency, and the entry loads only when the package is enabled.
5. The auth user and the transaction scope live in `AsyncLocalStorage` contexts of core. `web` fills the auth user for
   every request, `runAs(user, fn)` runs policy-checked code in workers and jobs, and `data` opens the transaction
   scope, so core code defers to the commit without knowing Prisma.
6. `ErrorCode`, the error details, all error classes and `defineErrors` live in `common`. A module declares its codes
   with their title and HTTP status, prefixed with its name, and only `web` turns them into responses.
7. A module translates the errors of its library: `data` registers the translator of the Prisma errors into a
   `DatabaseError`, which `web` applies to every error it handles, so `web` never imports Prisma. A third-party module
   registers its own the same way.
8. The config keys that change the database schema (API keys, connected accounts, the database security store) belong
   to `data`, so an API and a worker with the same config generate the same schema. `web` reads them.
9. The server is a lifecycle service of `web`, `Application` no longer knows about it. Server plugins register in
   ordered stages (`pre-auth`, `auth`, `routes`), keeping the current order (Swagger and auth before the routes).
10. Lint rules (`no-restricted-imports` per directory) enforce the target graph inside the current core before the
    move, and the package boundaries after it.

## 6. Module system

### 6.1 Module package

Every module, first- or third-party, has the same shape:

```
@acme/appweaver-gcs/
  package.json          "appweaver": { "module": "./dist/module.js" }, keyword "appweaver-module"
  src/module.ts         the manifest
  src/config.ts         the config section of the module
  src/gcs-storage.ts    class GcsStorage extends Storage
  test/                 runs the Storage contract suite of @appweaver/testing
```

The `src/` directory of a package is what a local module is in `src/modules/<name>/` of an app (section 10.4), and
the manifest field points at its build output.

```jsonc
// package.json
{
  "name": "@acme/appweaver-gcs",
  "keywords": ["appweaver-module"],
  "appweaver": { "module": "./dist/module.js" },
  "dependencies": { "@google-cloud/storage": "^7.0.0" },
  "peerDependencies": {
    "@appweaver/common": "^2.0.0",
    "@appweaver/core": "^2.0.0"
  }
}
```

```ts
// module.ts
export default defineModule({
  name: '@acme/appweaver-gcs',
  framework: '^2.0.0',
  config: [gcsConfig],
  providers: [
    { contract: Storage, name: 'gcs', load: () => import('./gcs-storage') }
  ]
});
```

### 6.2 Manifest

| Field                  | Purpose                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `name`                 | The package name                                                                                |
| `framework`            | The supported Appweaver version range, checked at startup                                       |
| `requires`             | The modules that must be enabled with it (`@appweaver/bullmq` requires `@appweaver/redis`)      |
| `config`               | Its config sections (section 7)                                                                 |
| `providers`            | Its contract implementations, `{ contract, name, load }`, where `load` imports the class lazily |
| `services`             | DI classes defined at startup, with their lifecycle hooks and health checks                     |
| `resources`            | Module path exporting models, services and policies, loaded only with `data`, and by `generate` |
| `main`                 | Module path loaded at startup: scheduled jobs, queue workers, event listeners                   |
| `web`                  | Module path of its resource routes, custom routes and Fastify plugins, loaded only with `web`   |
| `commands`             | Module path exporting `weaver` subcommands, i.e. `weaver newsletter:send`                       |
| `scaffold`             | What `weaver module add` adds to an application: files, config values, Docker services (10.2)   |
| `seeders`              | Its seeders directory                                                                           |
| `locales`, `templates` | Its translation and template directories, overridden by the files of the app                    |

A feature module can bring a whole feature this way, for example a newsletter module with its Subscriber model, routes,
emails and translations. The routes are in `web`, not in `resources`, so the module also works in an app without
`web`.

A module model relates to a model of the application only through a reference resolved when the app loads: the auth
model (as the API key model does today with `resourceAuthModel()`), or a model name taken from the module config.

### 6.3 Discovery and selection

- **Enabled modules** come from three sources, all with the same format:
  - **packages**: the dependencies in the `package.json` of the app whose manifest has the `appweaver.module` field,
    and the modules they require
  - **local modules**: every manifest matching `app.modulesPattern` (`APP_MODULES_PATTERN`, default
    `<srcPath>/modules/*/module.ts`), found without any config. Like `APP_SCAN_FILES_PATTERN`, the pattern resolves
    against the build directory at runtime (`./dist/src/modules/*/module.js`) and against the sources with Bun and in
    `weaver generate`. An empty pattern turns the scan off.
  - **explicit paths** of `app.modules` (`APP_MODULES`), i.e. a module outside the pattern or `..` in a playground
- `app.modulesDisabled` (`APP_MODULES_DISABLED`) opts any of them out by name. They load in the order of their
  `requires`, so a local module can require a package module, and two modules with one name fail the startup.
- `requires` names modules that are regular dependencies of the requiring package (`@appweaver/bullmq` depends on
  `@appweaver/redis`), so installing a module brings and enables what it requires.
- **The load order** is core, the package modules (`data` and `web` among them), local modules, then the code of the
  app (`APP_SCAN_FILES_PATTERN` and the `RESOURCE_*_PATTERN` files, which never match `<srcPath>/modules`). A later
  definition overrides an earlier one with the `override` mode of `define`, so the app replaces any service of a
  module.
- This replaces `APP_AUTOLOAD_MODULES`, the hardcoded `@appweaver/core/resources` and the service list of
  `load-providers.ts`. `weaver generate` uses the same discovery.
- **A driver is selected** by the short name its module registers (`"provider": "gcs"`), or by module path as today,
  i.e. `@/infra/my-storage` for a driver inside the app.
- **Provider keys default to `auto`**: the driver of an enabled module for that contract, otherwise the core one of
  section 4.2. The scheduler and the template engine stay disabled without a driver, and the mailer too, since the
  JSON mailer is selected explicitly. The choice is logged at startup, and two enabled drivers of one contract with
  `auto` fail the startup until one is picked.
- **`none` disables a contract** (`"mailer": { "provider": "none" }`), replacing `MAILER_ENABLED`, `SCHEDULER_ENABLED`
  and the other switches of today, so a test environment turns off a driver that stays installed.
- A driver is also defined under its own class name, so `inject(GcsStorage)` reaches its own methods.

## 7. Module config

Every module declares its config section with TypeBox, and it is read from the same sources, with the same precedence
and flattening as the config of today.

```ts
// config.ts
export const gcsConfig = defineConfig('storage.gcs', {
  BUCKET: Type.String({ description: 'Bucket the files are stored in' }),
  PROJECT_ID: Type.Optional(Type.String()),
  CREDENTIALS: Type.Optional(Type.String({ secret: true })),
  SIGNED_URL_TTL: Type.Integer({ default: 900_000 })
});

gcsConfig.BUCKET; // string, typed with Static<>
```

```jsonc
// appweaver.json
{
  "config": {
    "storage": {
      "provider": "gcs",
      "gcs": { "bucket": "app-files", "credentials": "${GCS_KEY}" }
    },
    "mailer": { "provider": "brevo", "brevo": { "apiKey": "${BREVO_KEY}" } }
  },
  "environments": {
    "test": { "storage": { "provider": "local" } }
  }
}
```

```bash
# The same values as environment variables
STORAGE_GCS_BUCKET=app-files
MAILER_BREVO_API_KEY=...
```

1. **The loader is split in two.** Reading the `.env` and JSON files and flattening every key happens once, as now.
   Validating a section happens in `defineConfig`. Everything else stays: the precedence (`config`,
   `environments.<env>`, `appweaver.<env>.json`, `.env`, `.env.<env>`, process env), the `${VAR:-default}` expansion
   and the conversion of the environment strings to booleans and arrays.
2. **A section is validated on its first access** with TypeBox `Value.Parse`, then frozen. A missing or invalid value
   throws a `ConfigurationError` naming both the environment variable and the JSON path. An installed driver that is
   not selected (GCS in `test` above) never asks for its config.
3. **The section path maps to the keys.** `storage.gcs` reads `config.storage.gcs.<camelCase>` from JSON and
   `STORAGE_GCS_<SNAKE>` from the environment, and the module reads the short name (`gcsConfig.BUCKET`). A driver
   nests its section under its contract, like the `MAILER_SMTP_*` keys of today, and any other module takes its own
   top-level section (`stripe`).
4. **Every section is registered**, which rejects two modules claiming the same section or the same flattened key, warns
   about unknown keys inside a registered section (`apiKye`) and hides the `secret` values in the logs. A parent and
   its subsections may belong to different modules (`mailer` to core, `mailer.brevo` to a driver), as long as no key of
   one equals a key of another (core cannot declare `mailer.brevoApiKey`).
5. **Appweaver uses the same API itself.** The single schema is replaced by the sections of each package: `common` keeps
   `app` and `log`, core `memory`, `cache`, `queue`, `events`, `mailer`, `storage`, `locale` and `health`, `data`
   `database`, `resource`, `export`, `storage.files` (the file records) and `security.password`, `security.apiKey`,
   `security.store` (the schema switches of section 5), and `web` owns `server`, `cors`, `swagger`, `rateLimit`,
   `healthCheck` and the other `security` subsections (routes, JWT, OAuth2, captcha). Keys are renamed where a section
   moves, i.e. `config.SERVER_PORT` becomes `serverConfig.PORT`. Applications use the same typed API for their own
   settings instead of `config.str('MY_KEY')`.
6. **The config documentation is generated.** `weaver config schema` (also run by `weaver generate` and
   `weaver module add`) builds the JSON Schema that `$schema` of `appweaver.json` points to, from the sections of the
   enabled modules, since a TypeBox schema is a JSON Schema. It also generates the `.env.example` block and the config
   table of the docs. This retires `common/config/schema.json` and `config-type.ts`, and the five files `AGENTS.md`
   lists for a config change come down to the one TypeBox definition.
7. **`weaver config print`** shows each value, secrets hidden, with the source it came from, and
   **`weaver config check --env prod`** validates the config of every selected driver in CI.

## 8. Contracts as a public interface

Once other people implement the abstract classes of `common/infrastructure`, any change to them breaks their packages.
Tighten them before freezing them in `2.0.0`:

- **`Storage`**: `store(name, data)` gets no content type or size, and there is no URL, so cloud files stream through
  the server. Add `store(name, data, { contentType, size })`, and an optional `url(name, { expiresIn })` the files
  route redirects to when a driver supports it.
- **`Mailer`**: `Attachment = any` differs per driver, and `Email` has no sender, cc, bcc or reply-to. Add one
  attachment shape for every driver (`{ filename, content, contentType }`), the sender, cc, bcc, reply-to and headers
  on `Email`, and `providerOptions` for the rest.
- **`Queue`**: the job and worker option types follow BullMQ. Add driver-neutral job options (delay, attempts, backoff,
  priority) and `providerOptions`.
- **`ImageProcessor`** (new): `processImage` of `core/utils/image-util.ts` calls sharp directly. A contract taking the
  stream, its MIME type and the image config of the file field lets `FileService` work without sharp, keeping the
  images as they are, and lets `@appweaver/sharp` or another driver transform them.
- **`Memory` and `Redis`**: `Redis` extends `Memory` and only adds `createClient`, which `Memory` already declares, and
  the samples already select the in-memory class as `REDIS_PROVIDER`. Merge them into `Memory`; BullMQ and the rate
  limit then require the `redis` driver of `Memory` for a real client.
- **`Scheduler`**: `addJob(jobParams)` takes `JobParams = any`, which the apps fill with the options of the `cron`
  package (`cronTime`, `onTick`, `timeZone`). Define driver-neutral job params with those three, and
  `providerOptions` for the rest.
- **`Cache`, `Events`, `TemplateEngine`, `SecurityStore`**: look fine at a glance, review each before the freeze.
  `Database` is not a public contract (section 4.2).

Rules for evolving them:

- Keep the contracts small.
- A member added in a minor release is a non-abstract method with a default, or an optional capability, so the
  existing drivers keep compiling.
- Changing or removing a member is a major release of `@appweaver/common`.

## 9. Tooling for module authors

- **`@appweaver/testing`** provides a test suite per contract (`testStorageContract(() => new GcsStorage())`,
  `testMailerContract(...)`, ...) and `createTestApp()`. The first-party drivers run the same suites. The suites use
  the `describe`/`test` globals, so they run in Jest, Vitest and Bun.
- **`weaver module add <package>`** (section 10.2) installs any module, first- or third-party, applies what its
  manifest declares to scaffold (config values, files, Docker services) and writes a config skeleton from its declared
  sections, without running any script of the module.
- **`skill/references/modules.md`** teaches AI agents how to write a module.
- **Naming**: `appweaver-<name>` or `@scope/appweaver-<name>`, with the npm keyword `appweaver-module` to find them.

## 10. Scaffolding

One scaffolder for applications and modules, `@appweaver/create` (renamed `create-weaver-app`), run as
`npm create @appweaver`. Payload (`create-payload-app -t plugin`), Medusa (`create-medusa-app --plugin`) and AdonisJS
(starter kits) do the same. The `.tpl` variables, the `.node`/`.bun` variants, the dependency versions of
`scaffoldDependencies` and the agent skill files are shared by both, and the templates are small.

One scaffold engine, exported as `@appweaver/create/scaffold`, adds the modules both when a project is created and
later with `weaver module`, so a module gives the same files whenever it is added.

```bash
npm create @appweaver my-app                                        # minimal application, core only
npm create @appweaver my-api -- --add web data redis queue docker   # modules added at creation
npm create @appweaver my-api -- --all --no-docker                   # every module but Docker
npm create @appweaver module appweaver-gcs -- --contract storage    # package of a driver
npm create @appweaver module appweaver-newsletter                   # package of a feature module
```

**Terminology**: a _module_ is any package with an Appweaver manifest, or one of the two scaffold-only modules of the
scaffolder (`locales`, `docker`), which add files but no package. A _driver_ is a module implementing a contract.
_Plugin_ keeps meaning a Fastify plugin (`registerPlugin`).

### 10.1 Creating an application

- The project starts minimal: `core` and `common`, the lint and test tooling, `src/main.ts`, `appweaver.json` and the
  agent skill files. Every other part is a module, added with `--add <modules...>` (separated by spaces or commas) or
  `--all`, where `--no-<module>` leaves one out of `--all`.
- A module required by an added one comes along with it (`queue` adds `redis`), and leaving out a module that a
  selected one requires is an error.
- The command asks no questions, so agents and scripts run it as it is.
- `--database sqlite | postgresql | mysql | sqlserver` picks the Prisma driver adapter of the `data` module, `sqlite`
  by default, and its Docker service.
- Creating a project creates the minimal project, then adds its modules exactly like `weaver module add`.

The first-party modules have reserved short names, every other module is named by its package:

| Module      | Package                               | Adds                                                                    | Without it                               |
| ----------- | ------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| `web`       | `@appweaver/web`                      | The server config, `public/`, the e2e test setup of the routes          | No server                                |
| `data`      | `@appweaver/data`                     | Prisma, its adapter, `database/`, the User resource (routes with `web`) | No database                              |
| `redis`     | `@appweaver/redis`                    | The Redis connection, its `docker-compose.yml` service                  | Per-process memory, cache and rate limit |
| `queue`     | `@appweaver/bullmq`, requires `redis` | The test override to the memory queue                                   | The memory queue                         |
| `scheduler` | `@appweaver/cron`                     | The test override not starting the jobs                                 | Scheduler disabled                       |
| `mailer`    | `@appweaver/nodemailer`               | The SMTP config, the account email templates with `templates`           | Mailer disabled                          |
| `templates` | `@appweaver/handlebars`               | `templates/`                                                            | No template engine                       |
| `images`    | `@appweaver/sharp`                    | Nothing besides the package                                             | Images stored as uploaded                |
| `locales`   | None, scaffold-only                   | `locales/en.json`                                                       | English texts written into the templates |
| `docker`    | None, scaffold-only                   | `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `start.sh`         | No Docker files                          |

An application kind of section 4.1 is its list of modules, i.e. `--add data scheduler` for the SQLite job runner.

### 10.2 Adding and removing modules

```bash
weaver module list                      # every module, enabled or not, with its packages and requirements
weaver module add templates locales     # first-party modules by their short name
weaver module add @acme/appweaver-gcs   # any other module by its package name
weaver module remove docker
weaver module new newsletter            # a local module (section 10.4)
```

`weaver module` (alias `mod`, `list` alias `ls`, `remove` alias `rm`):

- **`add`** installs the packages of the module (the first-party ones at the version of the CLI, the others at a
  release whose `framework` range fits), sets its `appweaver.json` values, writes its files, skipping an existing file
  that differs unless `--force` is passed, and adds what it brings to the modules already enabled: the Redis service of
  `docker-compose.yml`, the Dockerfile `COPY` blocks, the account email templates. The modules it requires come along.
- **`remove`** reverts all of it in the reverse order and deletes the files and the directories of the module (the whole
  `templates/` or `locales/`, the Docker files). It refuses to remove a module that a remaining one requires, and
  removing `locales` first writes the English texts of `locales/en.json` into the templates.
- Both never touch `src/` and keep the `appweaver.json` values the project changed. `--dry-run` prints the changes,
  `--no-install` skips the installation, `--verbose` prints its output.
- The enabled modules are the ones the runtime discovers (section 6.3), from the dependencies, and for the scaffold-only
  modules from their marker (`locales/`, `Dockerfile`).

What a module adds is declared in the `scaffold` field of its manifest (section 6.2), so a third-party module scaffolds
exactly like a first-party one:

| `scaffold` field | Purpose                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `files`          | Directory copied into the project (`.tpl` variables, `.node`/`.bun` variants), deleted again on removal |
| `directories`    | Directories the module owns, deleted with all of their contents on removal                              |
| `config`         | The `appweaver.json` values set while it is enabled, i.e. `config.redis.url` or an override of `test`   |
| `compose`        | Its `docker-compose.yml` services, added while `docker` is enabled                                      |
| `dockerfile`     | Its Dockerfile blocks (the `COPY` of its directories), added while `docker` is enabled                  |
| `with`           | Directories of files applying only while another module is enabled too (`mailer` with `templates`)      |
| `marker`         | For a scaffold-only module, the file whose presence marks it enabled                                    |

- No module sets values while it is disabled: the `auto` providers fall back by themselves (section 6.3), so removing
  `redis` needs no in-memory provider written into `appweaver.json`.
- `docker-compose.yml` is edited with the document API of `yaml`, keeping its formatting and comments, so adding and
  removing a service gives back the same file byte for byte.
- The integrations that transform files instead of copying them, like writing the English texts into the templates when
  `locales` goes, stay code of the scaffold engine, for its scaffold-only modules.
- The first-party packages keep their scaffold files in their own package, and the build copies them into
  `@appweaver/create`, so a project is created without installing anything first, also with `--no-install`.
- Every module and every integration stays reversible, covered by basic tests: adding and removing each module on its
  own, each integration once, and creating a project with `--all`. They keep the branch coverage of the engine above
  80%, without testing every combination of modules.

### 10.3 Module package templates

- **Driver** (`--contract` with `storage`, `mailer`, `queue`, `cache`, `memory`, `scheduler`, `events`, `template`,
  `image` or `security-store`): a class extending the contract with every abstract method stubbed and documented, its
  config section under the contract (`storage.<name>`, `STORAGE_<NAME>_*`), and the contract suite of
  `@appweaver/testing` already wired.
- **Feature** (default): a package importing `@appweaver/core` and `@appweaver/common` that can add anything. Each part
  is optional and switched by flags (`--no-resources`, `--no-web`, ...): services, models with their service and
  policy (in its `resources` entry, with `@appweaver/data` as an optional peer), routes and Fastify plugins (in its
  `web` entry, with `@appweaver/web` as an optional peer), scheduled jobs, queue workers and event listeners, seeders,
  locales and templates, its own config section and its `scaffold` field.

Every module project contains:

```
appweaver-gcs/
  package.json         keyword appweaver-module, "appweaver": { "module" }, peers common and core ^2
  src/module.ts        defineModule({ name, framework, config, providers, scaffold, ... })
  src/config.ts        defineConfig('storage.gcs', { ... })
  src/                 the implementation
  scaffold/            the files it adds to an application, if any
  test/                the contract suite and a module test with createTestApp()
  playground/          a small application loading the module from "..", started with `npm run dev`
  README.md            install steps (`weaver module add ...`) and the generated config table
  CLAUDE.md, skill     guidelines for AI agents writing modules (references/modules.md)
  tsconfig, eslint, jest and swc (or bun), CI and npm publish workflows
```

- The playground lets the module be developed inside a real application without linking packages by hand, which is
  why the discovery accepts explicit paths (`app.modules: [".."]`).
- Modules with models list `@appweaver/data` as a peer dependency and ship no migrations. The Prisma schema belongs to
  the application: its `weaver generate` includes the module models and its `weaver migration new` creates the
  migrations.
- The `generate` script of a module emits the types of its models and registers them in the `ResourceRegistry`, so
  `injectService('Subscriber')` is typed inside the module. The `weaver generate` of the app leaves the models of
  package modules out of its own registry, since TypeScript rejects the same registry key declared twice with
  different types. `data` works the same way for its own models, replacing the `--no-registry` of core.

### 10.4 Modules inside an application

`weaver module new <name> [--contract storage]` creates the same structure in `src/modules/<name>/` of an application,
without a `package.json`, its playground and its publish workflow. The local module discovery (section 6.3) enables it
without any config step, and the application compiles it with its own sources.

| Location              | Created with                   | Found by                                     | Dependencies                          |
| --------------------- | ------------------------------ | -------------------------------------------- | ------------------------------------- |
| `src/modules/<name>/` | `weaver module new <name>`     | `app.modulesPattern`, no config              | The `package.json` of the app         |
| Its own npm package   | `npm create @appweaver module` | The dependencies of the app's `package.json` | Its own, `core` and `common` as peers |

A local module that proves useful elsewhere moves into its own package unchanged, like a NestJS library
(`nest g library`) or a Rails engine: its folder becomes the `src/` of a package with a `package.json` declaring the
`appweaver.module` field and its dependencies. This only holds while it imports nothing of the application through the
`@/` aliases, which a lint rule of the app template enforces for `src/modules/**`. While it is local, the app registers
its models, since they are part of its sources. AI agents learn a single module format.

### 10.5 Upgrading an application

`weaver upgrade` (alias `up`) replaces `weaver update`, which is removed. It upgrades the `@appweaver/*` packages to one
version (every first-party module among them), the companion packages left in `scaffoldDependencies` (Prisma, its
adapters, TypeBox, TypeScript), and the agent skill files, with the options of today (`--target-version`,
`--no-skill`, `--no-companions`, `--tooling`, `--dry-run`, `--force`). The third-party modules keep their versions, and
a module whose `framework` range excludes the target version is reported before anything is installed.

### 10.6 Scaffolder changes

1. Rename the package to `@appweaver/create`, with the commander commands `app` (default) and `module`.
2. Move the engine into `scaffold/`, exported as `@appweaver/create/scaffold`: the module catalog read from the
   manifests, adding and removing modules with their integrations, loading an existing project with its enabled
   modules, and `ProjectFiles`, staging every write and deletion until a commit, which a dry run prints instead.
3. Split the templates into `templates/app/base/` (the minimal project), `templates/app/modules/<name>/` and
   `<a>+<b>/` (the scaffold-only modules, and the copies of the first-party scaffolds), and
   `templates/module/{base,feature,driver/<contract>}/` (the module packages).
4. `@appweaver/cli` depends on `@appweaver/create` for the engine of `weaver module`, at its exact version:
   `tools/copy-packages.js` pins the `@appweaver/*` dependencies of the published manifests to the release, and
   `tools/lock-samples.js` pins `@appweaver/create` too. The other way round, `npm create @appweaver` would install the
   peers of the CLI (core, Prisma, TypeScript).
5. Extract the shared steps of `create-weaver-app.ts` (variables, runtime variants, agent skill files, dependency
   versions) into utils used by both commands.
6. Write the driver stubs by hand per contract, and add a test that scaffolds the driver of every contract and
   type-checks it against `@appweaver/common`, so no stub falls behind its contract.
7. Add the basic tests of section 10.2, and a CI test that scaffolds a driver and a feature module package against
   the built local packages and runs their tests, the contract suite included.

## 11. Phases

### Quick wins, at any time

- Replace `date-fns` with small UTC date helpers, saving 28 MB in every app.
- Rename `weaver update` to `weaver upgrade` (alias `up`), removing `update`.
- Import `sharp` lazily, only when an upload configures an image transform.

### Phase 1: decouple inside the current core

1. The auth user context in core, with `runAs(user, fn)`, and the transaction scope of core without Prisma types,
   which the events, the cache service and `FileService` use instead of `database/transaction-context.ts`.
2. The error classes and `defineErrors` moved to `@appweaver/common`, the codes carrying their HTTP status.
3. `defineConfig`, the config registry and the split loader. The single schema converted into sections, with
   `provider: 'none'` replacing the `*_ENABLED` switches, generating the JSON Schema, the types, the `.env.example`
   block and the config docs table.
4. `defineModule`, the discovery of package, local and explicit modules, the load order, the provider names of section
   4.2 and the `auto` providers. `load-providers.ts`, `create-server.ts` and `resources.ts` converted into internal
   module manifests, and the CLI using the discovery.
5. The server as a lifecycle service with staged plugin registration, without `context.server`, `app.spec()` and the
   resource routes loaded by the server code.
6. The contracts tightened (section 8), with the new `ImageProcessor` and `Memory` merged with `Redis`, while every
   driver still lives in one package.
7. The database made optional: the `Database` provider loaded only with models, the Prisma errors translated by a
   registered translator instead of `errors/problem.ts`, and the models created only for the apps using them
   (section 4).
8. The health listener of core for apps without a server, and `weaver run`.
9. The code grouped by its future package: the HTTP files of each directory (`resource`, `storage`, `health`,
   `template`, `cache`) into `http/`, the authentication of `security` (JWT, API key, Basic, OAuth2, captcha, the auth
   and account services) into `security/http/`, and the database code (`database`, `resource`, `factory`, the auth
   data model, `FileService`, the database security store, `export`, `seeder`) apart from the runtime of core.
10. The lint rules of the target graph.
11. The scaffold engine and `weaver module list | add | remove` with the optional parts of today as modules (`redis`,
    `queue`, `scheduler`, `mailer`, `templates`, `locales`, `docker`): the minimal project by default, `--add`,
    `--all` and `--no-<module>` (`--no-cron` becoming `--no-scheduler`), `@appweaver/cli` depending on the scaffolder
    at its exact version, and the basic tests of section 10.2.

These come first, so that every package is created with them, and the contracts change once, before any driver moves.

### Phase 2: split into packages

1. Extract the leaves first, `sharp`, `cron`, `nodemailer`, `handlebars`, `redis`, `bullmq`, then `data`, then `web`,
   each with its `module.ts` and config sections, and the tests moved along with `git mv`.
2. Update the tooling: tsconfig references and root `paths`, the package lists of `release.config.js` and
   `tools/lock-samples.js`, the shared fixtures in `@appweaver/testing`, `scaffoldDependencies.companion` reduced to
   Prisma, the adapters, TypeBox and TypeScript, and the simplified `weaver upgrade`.
3. Move the samples and the scaffolder to the new packages: each package declares its `scaffold` field, the build
   copies the first-party scaffolds into the scaffolder, and `web`, `data` and `images` become modules of the minimal
   project, so the scaffolded projects keep working through the prereleases. Add two samples beyond the web ones:
   scheduled jobs storing their data in SQLite (`core`, `data`, `cron`), and a web app without a database sending
   emails (`core`, `web`, `nodemailer`, `handlebars`).
4. Publish `2.0.0-next.N` prereleases.

### Phase 3: module tooling and outside validation

1. Add the contract suites of `@appweaver/testing`, passed by every first-party driver.
2. Rename the scaffolder to `@appweaver/create`, add its module package templates and `weaver module new`, and let
   `weaver module add` take any module by its package name.
3. Build a Google Cloud Storage driver and a Brevo mailer with the module template, in repositories outside the
   monorepo, and fix the gaps they expose in the contracts, the config and the templates.

### Phase 4: developer experience and release

1. `weaver config print` and `weaver config check`.
2. `SKILL.md`, `skill/references/*.md` (with the new `modules.md` and the generated configuration reference),
   `AGENTS.md` and the package READMEs.
3. Release `2.0.0` with the contracts frozen.

## 12. Risks

- **An API and a worker sharing a database.** The Prisma schema of the worker must contain every table, otherwise its
  migrations would drop some. Share the models through a workspace package, possible without `web` since the auth data
  model and the File model are in `data`, and let only one application own the migrations.
- **A public contract is a commitment.** Every breaking change of a contract breaks the packages of other people, hence
  the outside drivers of phase 3 before the freeze.
- **The registry of module models.** A model registered by its module and again by the app fails the type check
  (section 10.3), so `weaver generate` must tell package modules from local ones.
- **Untested scaffold paths.** The scaffold tests stay basic (section 10.2), so a branch coverage threshold of 80%
  (`coverageThreshold` of `jest.config.json`, unset today) fails CI when new code goes untested.
- **Third-party code runs at startup**, like any dependency, and an installed module is enabled. `app.modulesDisabled`
  opts out, and `weaver module add` never runs scripts of the module.
- **Bun** runs every test file in one process with a frozen context, and `tools/copy-packages.js` writes an empty
  `tsconfig.json` into every copied package. Verify both for the new packages.
- **Type augmentations**: the Fastify ones move to `web`, the `@fastify/request-context` one goes away.
- **Package combinations** could break unnoticed. The end-to-end tests of the samples cover them, one sample per kind
  of section 4.1 (the API samples, the SQLite job runner and the web app without a database of phase 2), with no
  extra test matrix.
- **Lazy config validation** reports a misconfigured driver at startup instead of import, covered in CI by
  `weaver config check`.

## 13. Decisions

| Decision                                                                | Reason                                                                            |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Lockstep packages instead of one package with toggles                   | Dependencies declared per package, real size win, boundaries by construction      |
| Core, data, web and drivers, no package per directory                   | Only the HTTP stack, the database and heavy libraries are worth a package         |
| The database in `data`, out of core                                     | Apps without a database, Prisma installed only where used                         |
| HTTP authentication in `web`, the auth data model in `data`             | Workers share the models and the schema without Fastify                           |
| `EmailService` and the `local` storage in core, `FileService` in `data` | Emails and raw files without a database, file records with it                     |
| Drivers named after their library                                       | Room for other implementations of the same contract                               |
| Discovery from `package.json`, explicit paths with `APP_MODULES`        | Installing a module enables it, a single source of truth                          |
| Local modules found by `APP_MODULES_PATTERN`                            | `weaver module new` needs no config step, the same format as a package            |
| Config sections with `defineConfig`, validated on first access          | Same sources and env pattern for every module, unselected drivers ask for nothing |
| First-party modules use only the public API                             | Third-party modules can do everything the first-party ones do                     |
| `defineErrors` in common, HTTP statuses applied by `web`                | Modules without `web` declare their own error codes                               |
| Schema switches in `data`, its models only for the apps using them      | An API and its worker share a schema, a job runner gets no auth or file tables    |
| Health listener in core, `weaver run` for one-shot tasks                | Apps without `web` run in containers and as tasks                                 |
| `Database` is not a public contract                                     | The resources are built on Prisma, databases come from its driver adapters        |
| One scaffolder, `@appweaver/create`, with a `module` command            | Shared template machinery, one package to release                                 |
| A minimal project, modules added with `--add` or `weaver module add`    | An app starts with what it uses, and adds a module the same way later             |
| One scaffold engine for creating and for `weaver module`, reversible    | A module gives the same files however it is added or removed                      |
| Basic tests, 80% branch coverage, no combination matrix                 | Enough to catch regressions while the tests stay simple                           |
| The scaffold of a module declared in its manifest                       | Third-party modules add their files, config and Docker services too               |
| `@appweaver/cli` depends on `@appweaver/create` at its exact version    | Shared templates, and `npm create` installs no peers of the CLI                   |
| `weaver upgrade` instead of `weaver update`                             | Names the version bump, apart from the module changes of `weaver module`          |
| _Module_ and _driver_, _plugin_ stays a Fastify plugin                  | No clash with `registerPlugin`                                                    |
| Breaking `2.0.0` without a migration layer                              | No external users yet                                                             |
