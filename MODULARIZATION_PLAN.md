# Appweaver Modularization Plan

**Status**: proposal. **Target**: release `2.0.0`, breaking without a migration layer, since the framework has no
external users yet.

## 1. Goals

- An application installs only what it uses: a queue worker runs without the web server, an API without Redis.
- Smaller `node_modules` and Docker images, mostly for workers.
- Anyone can publish a module that implements a framework contract (Google Cloud Storage, a Brevo or Mailgun
  mailer, ...) or adds any other feature, with its own validated config in `appweaver.json` and environment variables.
- A new module is scaffolded with one command, as an npm package or as a folder inside an application.

## 2. Current state

### 2.1 Install size

Measured with `npm install --omit=dev` on linux-x64:

| Dependency                                          | Size (MB)  | Needed by                                                                         |
| --------------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| `@prisma/client`                                    | 77         | Every application with a database, no split removes it                            |
| `fastify` and 12 `@fastify/*` plugins               | 38         | The HTTP server only                                                              |
| `sharp`                                             | 30         | Image processing of uploads only, but loaded by every app (`core/utils/index.ts`) |
| `date-fns`                                          | 28         | Two files: `common/utils/string-util.ts`, `core/resource/utils/aggregate-util.ts` |
| `bullmq` and `ioredis`                              | 14         | The Redis queue, already an optional peer                                         |
| `@fastify/auth`, `basic-auth`, `jwt`, `oauth2`      | 7          | HTTP authentication                                                               |
| `handlebars`, `cron`, `nodemailer`, `csv-stringify` | 6, 5, 2, 1 | Optional peers, except `csv-stringify`                                            |
| `@appweaver/core` itself                            | 1.5        |                                                                                   |

A worker (core, Prisma with the pg adapter, BullMQ) installs **208 MB** today and about **115 MB** after the split.

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
5. **One config schema for everything.** It is parsed when `@appweaver/common` is imported (`common/config/config.ts`),
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

Split `packages/core` into a small **core**, one **web** package and thin **driver** packages, released together from
the monorepo at one version. Neither keep everything in one package with toggles, nor make a package of every
directory.

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
- `scaffoldDependencies.companion`, the companion bumps of `weaver update` and their version test exist only because
  core cannot declare `bullmq`, `cron`, ... as dependencies. A driver package declares them.
- Package boundaries rule out import cycles by construction.

Why not a package per directory: locale, cache, export, mailer, template, events, health and seeder are plain
TypeScript without heavy dependencies, used by the other modules. As packages they add release and test cost and save
no size. Only the HTTP stack and each heavy third-party library get a package.

## 4. Target packages

| Package                 | Role                                                                     | Third-party dependencies                            |
| ----------------------- | ------------------------------------------------------------------------ | --------------------------------------------------- |
| `@appweaver/common`     | Contracts, module and config definitions, logger, errors, shared types   | `@sinclair/typebox`, `pino`, `dotenv`, `glob`, ...  |
| `@appweaver/core`       | Everything a worker needs: context, data and the glue between them       | `@prisma/client` (peer), `csv-stringify`, `flatted` |
| `@appweaver/web`        | The HTTP stack, with authentication                                      | `fastify`, `@fastify/*`                             |
| `@appweaver/redis`      | Redis connection provider, Redis cache, Redis security store, rate limit | `ioredis`                                           |
| `@appweaver/bullmq`     | BullMQ queue, requires `@appweaver/redis`                                | `bullmq`                                            |
| `@appweaver/cron`       | Cron scheduler                                                           | `cron`                                              |
| `@appweaver/nodemailer` | SMTP mailer                                                              | `nodemailer`                                        |
| `@appweaver/handlebars` | Handlebars template engine and its helpers                               | `handlebars`                                        |
| `@appweaver/sharp`      | Image processing of the uploaded files                                   | `sharp`                                             |
| `@appweaver/testing`    | Contract test suites, `createTestApp()`, the shared test fixtures        |                                                     |
| `@appweaver/cli`        | Unchanged, `weaver generate` and `weaver seed` use the module discovery  |                                                     |
| `@appweaver/client`     | Unchanged                                                                |                                                     |
| `@appweaver/create`     | Renamed `create-weaver-app`, with the app and module templates (sec. 10) |                                                     |

**`@appweaver/common`** adds `defineModule`, `defineConfig` and the split config loader to the current contracts,
logger and utils, and takes over `ErrorCode` with every error class.

**`@appweaver/core`** keeps:

- the DI context, the application lifecycle, the module and provider loading
- the database (Prisma), and the resources: service, loader, filter, sort, aggregate and model schemas
- `createModel`, `createService` and `createPolicy`
- the auth data model: `createAuthModel`, `createAuthService`, the role, permission, API key, one-time token and
  connected account models, password hashing, `hasRole`/`hasPermission`, and the auth user context
- `FileService` with the filesystem storage and the File model, `EmailService` with the JSON mailer
- locale, the cache service with the memory cache, the in-memory memory and queue, the database security store, node
  events, CSV export, the health service and the seeder

**`@appweaver/web`** takes:

- the Fastify server, Swagger, `registerRoute`, `registerPlugin` and `registerModel`
- `createRoutes` with the resource routes and their schemas
- the HTTP errors: `errorHttpMap`, problem details, `defineErrors`, `errorResponses`
- JWT, API key, Basic and OAuth2 authentication with `AuthService`, `AccountService` and `OAuth2Service`, reCAPTCHA and
  Turnstile
- the auth, account, files, health, info and template preview routes
- rate limit, response caching, CORS, Helmet, static files and multipart

```
@appweaver/common
└── @appweaver/core
    ├── @appweaver/web
    ├── @appweaver/redis ── @appweaver/bullmq
    ├── @appweaver/cron
    ├── @appweaver/nodemailer
    ├── @appweaver/handlebars
    └── @appweaver/sharp
```

- The core is everything a worker needs: context, data and the glue between them. The web server is not part of it.
- The HTTP authentication lives in `web`: nearly every API needs it and no worker does. The auth data model stays in
  core, so a worker shares the models and the database schema of its API.
- The drivers are named after the library they wrap, leaving room for other implementations of the same contract
  (`@appweaver/s3`, `@appweaver/ses`, `@appweaver/pg-boss`). They are 100–300 lines each and rarely change, so their
  count costs little upkeep.

| Application    | Packages                                                                       |
| -------------- | ------------------------------------------------------------------------------ |
| Queue worker   | `core`, `redis`, `bullmq`                                                      |
| Scheduled jobs | `core`, `cron`                                                                 |
| API            | `core`, `web`, plus the drivers it uses (`redis`, `bullmq`, `nodemailer`, ...) |

```jsonc
// package.json of a worker
"dependencies": {
  "@appweaver/common": "^2.0.0",
  "@appweaver/core": "^2.0.0",
  "@appweaver/redis": "^2.0.0",
  "@appweaver/bullmq": "^2.0.0",
  "@prisma/adapter-pg": "7.9.1",
  "@prisma/client": "7.9.1"
}
```

```ts
// src/main.ts, no server is created since @appweaver/web is not enabled
await createApp();
```

## 5. Architecture rules

1. `@appweaver/common` and `@appweaver/core` are peer dependencies of every other package, never dependencies, so an
   app has one DI context. The startup fails on a second copy of either.
2. All first-party packages share one version and are released together, as today.
3. Only `@appweaver/web` and the `web` entries of modules import Fastify. The core and the drivers never do.
4. The auth user lives in an `AsyncLocalStorage` context of core, like the transaction context of
   `database/transaction-context.ts`. `web` fills it for every request, and `runAs(user, fn)` runs policy-checked code
   in workers and jobs.
5. `ErrorCode`, the error details and all error classes live in `common`. Only `web` maps the codes to HTTP statuses.
6. The server is a lifecycle service of `web`, `Application` no longer knows about it. Server plugins register in
   ordered stages (`pre-auth`, `auth`, `routes`), keeping the current order (Swagger and auth before the routes).
7. Lint rules (`no-restricted-imports` per directory) enforce the target graph inside the current core before the move,
   and the package boundaries after it.

## 6. Module system

### 6.1 Module package

Every module, first- or third-party, has the same shape:

```
@acme/appweaver-gcs/
  package.json        "appweaver": { "module": "./module.js" }, keyword "appweaver-module"
  module.ts           the manifest
  config.ts           the config section of the module
  gcs-storage.ts      class GcsStorage extends Storage
  test/               runs the Storage contract suite of @appweaver/testing
```

```jsonc
// package.json
{
  "name": "@acme/appweaver-gcs",
  "keywords": ["appweaver-module"],
  "appweaver": { "module": "./module.js" },
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
| `resources`            | Module path exporting models, services, policies and routes, also loaded by `weaver generate`   |
| `main`                 | Module path loaded at startup: scheduled jobs, queue workers, event listeners                   |
| `web`                  | Module path of its Fastify plugins and routes, loaded only when `@appweaver/web` is enabled     |
| `seeders`              | Its seeders directory                                                                           |
| `locales`, `templates` | Its translation and template directories, overridden by the files of the app                    |

A feature module can bring a whole feature this way, for example a newsletter module with its Subscriber model, routes,
emails and translations.

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
- This replaces `APP_AUTOLOAD_MODULES`, the hardcoded `@appweaver/core/resources` and the service list of
  `load-providers.ts`. `weaver generate` uses the same discovery.
- **A driver is selected** by the short name its module registers (`"provider": "gcs"`), or by module path as today,
  i.e. `@/infra/my-storage` for a driver inside the app.
- **Provider keys default to `auto`**: the driver of an enabled module for that contract, otherwise the implementation
  in core (memory cache, memory queue, database security store, filesystem storage). The mailer and the scheduler are
  disabled without a driver, the JSON mailer is selected explicitly. The choice is logged at startup, and two enabled
  drivers of one contract with `auto` fail the startup until one is picked.
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
4. **Every section is registered**, which rejects two modules claiming the same section or key, warns about unknown keys
   inside a registered section (`apiKye`) and hides the `secret` values in the logs.
5. **Appweaver uses the same API itself.** The single schema is replaced by the sections of each package: `common` keeps
   `app` and `log`, core `database`, `resource`, `storage`, `cache`, `queue`, `mailer`, `locale`, ..., and `web` owns
   `server`, `cors`, `swagger`, `rateLimit`, `healthCheck` and `security`. `config.SERVER_PORT` becomes
   `serverConfig.PORT`. Applications use the same typed API for their own settings instead of `config.str('MY_KEY')`.
6. **The config documentation is generated.** `weaver config schema` (also run by `weaver generate` and `weaver add`)
   builds the JSON Schema that `$schema` of `appweaver.json` points to, from the sections of the enabled modules,
   since a TypeBox schema is a JSON Schema. It also generates the `.env.example` block and the config table of the
   docs. This retires `common/config/schema.json` and `config-type.ts`, and the five files `AGENTS.md` lists for a
   config change come down to the one TypeBox definition.
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
- **`Cache`, `Memory`, `Scheduler`, `Events`, `TemplateEngine`, `SecurityStore`, `Database`**: look fine at a glance,
  review each before the freeze.

Rules for evolving them:

- Keep the contracts small.
- A member added in a minor release is a non-abstract method with a default, or an optional capability, so the
  existing drivers keep compiling.
- Changing or removing a member is a major release of `@appweaver/common`.

## 9. Tooling for module authors

- **`@appweaver/testing`** provides a test suite per contract (`testStorageContract(() => new GcsStorage())`,
  `testMailerContract(...)`, ...) and `createTestApp()`. The first-party drivers run the same suites. The suites use
  the `describe`/`test` globals, so they run in Jest, Vitest and Bun.
- **`weaver add <package>`** installs any module, first- or third-party, and writes a config skeleton from its declared
  sections, without running any script of the module.
- **`skill/references/modules.md`** teaches AI agents how to write a module.
- **Naming**: `appweaver-<name>` or `@scope/appweaver-<name>`, with the npm keyword `appweaver-module` to find them.

## 10. Scaffolding

One scaffolder for applications and modules, `@appweaver/create` (renamed `create-weaver-app`), run as
`npm create @appweaver`. Payload (`create-payload-app -t plugin`), Medusa (`create-medusa-app --plugin`) and AdonisJS
(starter kits) do the same. The `.tpl` variables, the `.node`/`.bun` variants, the dependency versions of
`scaffoldDependencies` and the agent skill files are shared by both, and the templates are small.

```bash
npm create @appweaver my-api                                       # application (default command)
npm create @appweaver my-worker -- --no-web                        # application without the HTTP stack
npm create @appweaver module appweaver-gcs -- --contract storage   # driver of a contract
npm create @appweaver module appweaver-newsletter                  # feature module
```

**Terminology**: a _module_ is any package with an Appweaver manifest, a _driver_ is a module implementing a contract.
_Plugin_ keeps meaning a Fastify plugin (`registerPlugin`).

### 10.1 Module templates

- **Driver** (`--contract storage | mailer | queue | cache | memory | scheduler | events | template | security-store`):
  a class extending the contract with every abstract method stubbed and documented, its config section under the
  contract (`storage.<name>`, `STORAGE_<NAME>_*`), and the contract suite of `@appweaver/testing` already wired.
- **Feature** (default): a package importing `@appweaver/core` and `@appweaver/common` that can add anything. Each part
  is optional and switched by flags (`--no-resources`, `--no-web`, ...): services, models with their service, policy
  and routes, web routes and Fastify plugins, scheduled jobs, queue workers and event listeners, seeders, locales and
  templates, its own config section.

Every module project contains:

```
appweaver-gcs/
  package.json         keyword appweaver-module, "appweaver": { "module" }, peers common and core ^2
  module.ts            defineModule({ name, framework, config, providers, ... })
  config.ts            defineConfig('storage.gcs', { ... })
  src/                 the implementation
  test/                the contract suite and a module test with createTestApp()
  playground/          a small application loading the module from "..", started with `npm run dev`
  README.md            install steps (`weaver add ...`) and the generated config table
  CLAUDE.md, skill     guidelines for AI agents writing modules (references/modules.md)
  tsconfig, eslint, jest and swc (or bun), CI and npm publish workflows
```

- The playground lets the module be developed inside a real application without linking packages by hand, which is
  why the discovery accepts explicit paths (`app.modules: [".."]`).
- Modules with models ship no migrations. The Prisma schema belongs to the application: its `weaver generate` includes
  the module models and its `weaver migration new` creates the migrations. The `generate` script of a module only
  emits its types (`--no-registry`), as core does today.

### 10.2 Modules inside an application

`weaver new module <name> [--contract storage]` creates the same structure in `src/modules/<name>/` of an application,
without a `package.json`, its playground and its publish workflow. The local module discovery (section 6.3) enables it
without any config step, and the application compiles it with its own sources.

| Location              | Created with                   | Found by                                     | Dependencies                          |
| --------------------- | ------------------------------ | -------------------------------------------- | ------------------------------------- |
| `src/modules/<name>/` | `weaver new module <name>`     | `app.modulesPattern`, no config              | The `package.json` of the app         |
| Its own npm package   | `npm create @appweaver module` | The dependencies of the app's `package.json` | Its own, `core` and `common` as peers |

A local module that proves useful elsewhere moves into its own package unchanged, like a NestJS library
(`nest g library`) or a Rails engine: copy the folder and add a `package.json` with the `appweaver.module` field and its
dependencies. This only holds while it imports nothing of the application through the `@/` aliases, which the lint
rules of the module template enforce. AI agents learn a single module format.

### 10.3 Scaffolder changes

1. Rename the package to `@appweaver/create`, with the commander commands `app` (default) and `module`.
2. Move the templates to `templates/app/` (the current `default`) and
   `templates/module/{base,feature,driver/<contract>}/`.
3. Extract the shared steps of `create-weaver-app.ts` (variables, runtime variants, agent skill files, dependency
   versions) into utils used by both commands.
4. Write the driver stubs by hand per contract, and add a test that scaffolds the driver of every contract and
   type-checks it against `@appweaver/common`, so no stub falls behind its contract.
5. Add a CI test that scaffolds a driver and a feature module against the built local packages and runs their tests,
   the contract suite included.

## 11. Phases

### Quick wins, at any time

- Replace `date-fns` with small UTC date helpers, saving 28 MB in every app.
- Import `sharp` lazily, only when an upload configures an image transform.

### Phase 1: decouple inside the current core

1. The auth user context in core, with `runAs(user, fn)`.
2. The error classes moved to `@appweaver/common`.
3. `defineConfig`, the config registry and the split loader. The single schema converted into sections, generating the
   JSON Schema, the types, the `.env.example` block and the config docs table.
4. `defineModule`, the discovery of package, local and explicit modules, the short provider names and the `auto`
   providers. `load-providers.ts`,
   `create-server.ts` and `resources.ts` converted into internal module manifests, and the CLI using the discovery.
5. The server as a lifecycle service with staged plugin registration, without `context.server`.
6. The HTTP files of every directory (`resource`, `security`, `storage`, `health`, `template`, `cache`) grouped into
   `http/` subdirectories, and the auth data model into `auth/`.
7. The lint rules of the target graph.

These come first, so that every package is created with them.

### Phase 2: split into packages

1. Extract the leaves first, `sharp`, `cron`, `nodemailer`, `handlebars`, `redis`, `bullmq`, then `web`, each with its
   `module.ts` and config sections, and the tests moved along with `git mv`.
2. Update the tooling: tsconfig references and root `paths`, the package lists of `release.config.js` and
   `tools/lock-samples.js`, the shared fixtures in `@appweaver/testing`, `scaffoldDependencies.companion` reduced to
   Prisma, the adapters, TypeBox and TypeScript, and the simplified `weaver update`.
3. Move the samples to the new packages.
4. Publish `2.0.0-next.N` prereleases.

### Phase 3: contracts and module tooling

1. Tighten the contracts (section 8).
2. Add the contract suites of `@appweaver/testing`, passed by every first-party driver.
3. Add the module templates of `@appweaver/create` and `weaver new module`.
4. Build a Google Cloud Storage driver and a Brevo mailer with the module template, in repositories outside the
   monorepo, and fix the gaps they expose in the contracts, the config and the templates.

### Phase 4: developer experience and release

1. `weaver add`, `weaver config print` and `weaver config check`.
2. The application template: `--no-web`, and the driver flags installing the `@appweaver/*` drivers.
3. `SKILL.md`, `skill/references/*.md` (with the new `modules.md` and the generated configuration reference),
   `AGENTS.md` and the package READMEs.
4. Release `2.0.0` with the contracts frozen.

## 12. Risks

- **An API and a worker sharing a database.** The Prisma schema of the worker must contain every table, otherwise its
  migrations would drop some. Share the models through a workspace package, possible without `web` since the auth data
  model and the File model stay in core, and let only one application own the migrations.
- **A public contract is a commitment.** Every breaking change of a contract breaks the packages of other people, hence
  the outside drivers of phase 3 before the freeze.
- **Third-party code runs at startup**, like any dependency, and an installed module is enabled. `app.modulesDisabled`
  opts out, and `weaver add` never runs scripts of the module.
- **Bun** runs every test file in one process with a frozen context, and `tools/copy-packages.js` writes an empty
  `tsconfig.json` into every copied package. Verify both for the new packages.
- **Type augmentations**: the Fastify ones move to `web`, the `@fastify/request-context` one goes away.
- **Lazy config validation** reports a misconfigured driver at startup instead of import, covered in CI by
  `weaver config check`.

## 13. Decisions

| Decision                                                         | Reason                                                                            |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Lockstep packages instead of one package with toggles            | Dependencies declared per package, real size win, boundaries by construction      |
| Core, web and drivers, no package per directory                  | Only the HTTP stack and heavy libraries are worth a package                       |
| HTTP authentication in `web`, the auth data model in core        | Workers share the models and the schema without Fastify                           |
| `FileService`, `EmailService` and their models in core           | No heavy dependencies, used by workers, the drivers carry the libraries           |
| Drivers named after their library                                | Room for other implementations of the same contract                               |
| Discovery from `package.json`, explicit paths with `APP_MODULES` | Installing a module enables it, a single source of truth                          |
| Local modules found by `APP_MODULES_PATTERN`                     | `weaver new module` needs no config step, the same format as a package            |
| Config sections with `defineConfig`, validated on first access   | Same sources and env pattern for every module, unselected drivers ask for nothing |
| One scaffolder, `@appweaver/create`, with a `module` command     | Shared template machinery, one package to release                                 |
| _Module_ and _driver_, _plugin_ stays a Fastify plugin           | No clash with `registerPlugin`                                                    |
| Breaking `2.0.0` without a migration layer                       | No external users yet                                                             |
