# Project Guidelines

## 1. Build & Configuration

The project is a TypeScript monorepo using `tsc -b` for builds.

- **Initial Setup**: Run `npm install` to install all dependencies.
- **Building**: Run `npm run build` from the root. This performs:
    - `prebuild`: Removes the `dist` folders of all packages (`clean:packages`).
    - `tsc -b -v packages`: Incremental build of all packages.
    - `postbuild`: Resolves the path aliases of the client's ESM output (`resolve:esm`), cleans
      `node_modules/@appweaver` (`clean:modules`), and copies the built packages there via `tools/copy-packages.js` to
      allow packages and samples to reference each other during development.
- **Rebuilding**: there is no watch script. Rerun `npm run build`, or run `node tools/copy-packages.js` after a manual
  `tsc -b packages/<name>` to refresh `node_modules/@appweaver`.

### CLI conventions

Every CLI (`weaver`, `weaver-client`, `create-appweaver`) uses **kebab-case** long flags (`--dry-run`,
`--model-pattern`). A flag that turns something off is declared as a Commander negation (`--no-install`,
`--no-skill`), which the action reads as the positive option (`command.getOptionValue('install')`, `true` unless the
flag is passed). Never add `--skipX` or camelCase flags. `-v` is reserved for `--version` on the program level, so
`--verbose` has no short form.

## 2. Testing

Tests are located in `packages/*/test` and use **Jest** with **SWC** for fast execution.

- **Running all tests**: `npm test`, with coverage
- **Running specific tests**: `jest path/to/file.test.ts`
- **Type-checking the tests**: `npm run test:typecheck`
- **Coverage threshold**: the `coverageThreshold` of `jest.config.json` fails `npm test` below 80% of the branches
  covered, so a change adds the tests of its branches
- **Package sources**: the `moduleNameMapper` of `jest.config.json` maps every `@appweaver/*` import (and subpath) to
  the sources of its package, so the tests need no build and the tests of every package share one instance of each
  module. A new package is added to both of its patterns
- **Test helpers**: `resetContext`, `linkModels`, `createDatabaseStub`, `prismaError` and `sourceLoggerNames` of
  `@appweaver/testing` (`packages/testing`), shared by the tests of every package
- **Contract suites**: the test of a driver runs the suite of its contract from `@appweaver/testing`, i.e.
  `testStorageContract('FilesystemStorage', () => new FilesystemStorage())` (see `packages/testing`)

### Naming and layout

- Test files must use the **`.test.ts`** extension.
- Name the file after the module under test: `utils/string-util.ts` → `test/utils/string-util.test.ts`.
- Mirror the source folder structure inside `test/`, so a test's location is derivable from the source path.
- Follow the standard `describe`/`test`/`expect` pattern, with a `describe` block per exported function.

**Example Test Case**:

```ts
describe('Feature Verification', () => {
  test('should perform expected action', () => {
    const result = someFunction();
    expect(result).toBe(true);
  });
});
```

## 3. Development Information

- **Code Style**:
    - **Formatting**: The project uses **Prettier**. Run `npm run format` to format the codebase after every task that
      involves code changes.
    - **Linting**: The project uses **ESLint**. Run `npm run lint` to check for issues and `npm run lint -- --fix` to
      automatically fix what's possible.
    - **Circular dependencies**: Run `npm run check:circular` to check the package sources for import cycles with
      madge (`.madgerc`). It skips the type-only and dynamic imports, which never run at load time, so it fails only on
      a cycle of runtime imports. A shorter import through a directory barrel (`index.ts`) loads every module of the
      barrel, so check it too.
    - **Comments**: Keep code comments short and to the point. Explain only what the code itself cannot show.
    - **Class member order**: fields first, then all public methods, then the private ones.
    - **Type member order**: in an interface or type, required properties come first, optional ones after them.
    - **`@internal`**: only on class members, the private ones, or rarely a public one a class adds beside the
      interface from `packages/common` it implements. Never on plain functions, constants or types.
- **Dependency Management**: Packages are linked locally in `node_modules/@appweaver` after the build. Ensure you run
  `npm run build` after making changes to shared packages if they are used by other packages or the sample application.

**IMPORTANT**: after a new feature is added or change is done in how the library is used, always update the
[SKILL.md](./skill/SKILL.md) file and any of the referenced files in ./skill/references/*.md.

## 4. Architecture — Package Modules

### `packages/common`

Shared utilities, logger, configuration, and base types used by all other packages. Contains foundational TypeScript
interfaces, type definitions, and helper utilities consumed by every other package.

The config is split into sections declared with `defineConfig` (`packages/common/config/define-config.ts`), each in the
module it belongs to: `appConfig` and `logConfig` in `packages/common/config/app-config.ts`, the other ones in a
`<module>-config.ts` file of their package directory (`serverConfig` in `packages/web/server/server-config.ts`,
`databaseConfig` in `packages/data/database/database-config.ts`, `redisConfig` in `packages/redis/config.ts`, ...). A
section reads its keys by their short names (`serverConfig.PORT` for `SERVER_PORT`), its TypeBox schema gives the
types, and a doc comment above each key describes it. Two packages may define the same section path with their own
keys (`healthCheck` in core and web, `security.oauth2` in data and web), but a flattened key belongs to one section
only. Tests override any key with `configOverrides` of `@appweaver/common`, by its flattened name.

A module lists its sections in the `config` of its manifest, which registers them when the module is discovered, so
`weaver generate` writes the JSON Schema of `appweaver.json` (`appweaver.schema.json`, the `$schema` of the samples and
the scaffolded projects) from the enabled modules, and the application validates them when it starts. A new section of
a framework package is added to the `config` of its manifest.

A module also lists the names of its `createLogger` loggers in the `loggers` of its manifest, which the schema
offers as the keys of `log.levels` (`definitions.logLevel`), still accepting any other name. A new logger name of a
framework package is added to its manifest, which the `module` test of the package checks with `sourceLoggerNames` of
`@appweaver/testing`.

When adding or changing a config key, make sure to also update all the following files:

- **skill/references/configuration.md**: Skill for configuration usage by AI agents
- **appweaver.example.json**: example defaults as JSON properties
- **.env.example**: example defaults as env variables

### Errors

Code outside the API layer never throws an HTTP error. Every module throws a subclass of the abstract `AppweaverError`
of `packages/common/errors` (`ResourceError`, `AuthError`, `DatabaseError`, ...), carrying a code of the
`ErrorCode` enum and typed details. Every error class lives in `packages/common/errors/module-errors.ts`, and the
application error codes are declared with `defineErrors` of `packages/common/errors/define-errors.ts`, with their HTTP
status and title. Only `web/errors` maps a code to its HTTP status (`errorHttpMap`) and responds with RFC 9457
problem details. Wrap the errors of Prisma calls with `toDatabaseError`, which names the violated
constraint. When adding an error code:

- add it to `ErrorCode` in `packages/common/errors/error-code.ts`, prefixed with the module raising it
- add its details to `ErrorDetailsMap` in `packages/common/errors/error-details.ts`, unless it carries none
- map it in `errorHttpMap` of `packages/web/errors/error-http-map.ts` (a missing code fails to compile)
- list it in the `errorResponses` of the routes responding with it, and in `skill/references/errors.md`

### Framework packages

The framework is split into packages, each a module (see the module system below) an application enables by depending
on it:

| Package                                                 | Holds                                                                                        |
|---------------------------------------------------------|----------------------------------------------------------------------------------------------|
| `@appweaver/core`                                       | The runtime: modules, lifecycle, dependency injection, the in-process drivers                |
| `@appweaver/data`                                       | Prisma, the resources, the auth data model, `FileService`, the seeders and the CSV export    |
| `@appweaver/web`                                        | The Fastify server, the resource routes, the authentication, the problem details and Swagger |
| `@appweaver/redis`, `bullmq`, `cron`, `nodemailer`, ... | One driver each, carrying the library it wraps as a dependency                               |
| `@appweaver/testing`                                    | The test helpers shared by the packages                                                      |

The directories moved as they were, so a file keeps its path within its package (`core/server/register-route.ts` is
now `web/server/register-route.ts`). `@appweaver/common` and `@appweaver/core` are peer dependencies of every other
package, `@appweaver/data` also of `@appweaver/web`. A package imports another one by its package name, never by a
relative path.

Every package declares its entry points in the `exports` field of its `package.json`, so Node refuses a deep import of
any other file. Besides `.` and `./package.json`:

| Entry point                  | Holds                                                                                      |
|------------------------------|--------------------------------------------------------------------------------------------|
| `@appweaver/core/config`     | The config sections of core, without loading the runtime (the CLI)                         |
| `@appweaver/core/drivers`    | The in-process drivers (`InMemory`, `NodeEvents`, `FilesystemStorage`, `MemoryQueue`, ...) |
| `@appweaver/core/internal`   | `context`, the transaction scope, `LifecycleManager` and `loadProviders`, for the packages |
| `@appweaver/data/config`     | The config sections of data, without loading Prisma (the CLI and `prisma.config.ts`)       |
| `@appweaver/web/config`      | The config sections of web, without loading Fastify                                        |
| `@appweaver/data/internal`   | `pruneUnusedModels`, for `weaver generate`                                                 |
| `@appweaver/create/scaffold` | The scaffolding engine of `weaver module`                                                  |
| `@appweaver/client/angular`  | The Angular client (`AngularClient`), with its ESM and CommonJS builds                     |

`@appweaver/core/app/application` is exported for the type augmentation of `Application` by `@appweaver/web` only. A
new entry point is a file at the root of its package (`internal.ts`), added to its `exports`. The tests are not bound
by them, since Jest maps every import to the sources.

### `packages/core`

The runtime every application has, with neither a server nor a database. Organized into the following modules:

| Module       | Purpose                                                                                                                              |
|--------------|--------------------------------------------------------------------------------------------------------------------------------------|
| `app/`       | `createApp`, `Application`, module discovery (`discover-modules.ts`), provider selection (`load-providers.ts`), app files, lifecycle |
| `modules/`   | The manifest of the core module (`core.ts`): every contract and its in-process driver, always enabled first                          |
| `context/`   | Dependency injection container (`define`, `inject`, `injectService`, ...), the auth user context (`runAs`) and the transaction scope |
| `cache/`     | The `Cache` stored in the `Memory` provider, its eviction indexes and `CacheService`                                                 |
| `memory/`    | The in-process `memory` driver of `Memory`                                                                                           |
| `events/`    | The `node` driver of `Events`                                                                                                        |
| `storage/`   | The `local` filesystem driver of `Storage`                                                                                           |
| `queue/`     | The in-process `memory` driver of `Queue`                                                                                            |
| `scheduler/` | The scheduler config, its driver is `@appweaver/cron`                                                                                |
| `mailer/`    | `EmailService`, rendering the template emails, and the `json` mailer of development and tests                                        |
| `template/`  | The template config and `registerTemplate` / `registerTemplateHelper`, the engine is `@appweaver/handlebars`                         |
| `locale/`    | Locale service — translating the dotted keys of the nested JSON translation files, with the framework's own English translations     |
| `health/`    | `HealthService` (the checks, and the readiness the lifecycle sets), the `node:http` health listener of an app without web            |
| `security/`  | The `security.store` config and the `memory` security store (`store/`)                                                               |
| `types/`     | `ApplicationContext`                                                                                                                 |
| `utils/`     | `createSchemaModel`                                                                                                                  |

**Module system**: every part of the framework is a module declared with `defineModule`
(`packages/common/module/define-module.ts`): the contracts it declares, its providers (drivers) by name, its services,
its `setup`, resources, `main` and `web` parts. `discoverModules` enables the core module, the dependencies with an
`appweaver.module` field in their `package.json` (and the modules they `require`), the local manifests of
`APP_MODULES_PATTERN` and the paths of `APP_MODULES`, minus `APP_MODULES_DISABLED`, ordered by their `requires`.
`createApp` then loads the providers and services, runs the `setup` of every module (data loads the resources of the
app and the modules, web the resource routes and the `web` parts), the `main` parts, then the app files.
`loadProviders` defines the provider of every contract from its `*.provider` key: `auto` (the default) picks the
driver of an enabled module, else the fallback of core, `none` disables the contract and the services requiring it, a
name selects a provider, and a module path still loads a class. The provider names are `memory` and `redis`
(`Memory`), `memory` (`Cache`), `node` (`Events`), `local` (`Storage`), `database` and `memory` (`SecurityStore`),
`memory` and `bullmq` (`Queue`), `smtp` and `json` (`Mailer`), `handlebars` (`TemplateEngine`), `cron` (`Scheduler`),
`prisma` (`Database`) and `sharp` (`ImageProcessor`). A new driver goes into a module manifest with a provider name,
never into `load-providers.ts`, and is documented in `skill/references/modules.md` and
`skill/references/configuration.md`.

**Utility placement rule**: the `utils/` of a package holds helpers shared by two or more of its modules, or ones
useful to library users directly. Helpers internal to a single module go in that module's own `utils/` directory (i.e.
`data/resource/utils`), keeping `utils/` a leaf that cannot form import cycles.

### `packages/data`

The database module (`@appweaver/data`), built on Prisma, with `@prisma/client` as a peer dependency. Its `setup`
loads the resources of the application, then the `resources` of the modules.

| Module      | Purpose                                                                                                                                            |
|-------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| `database/` | `PrismaDatabase` (the `prisma` driver of `Database`), the client factory, `runTransaction` and `toDatabaseError`                                   |
| `resource/` | Resource loading (`loadResources`), `ResourceService`, the model, filter, sort and aggregate schemas, the query `utils/`                           |
| `factory/`  | `createModel`, `createPolicy` and `createService`                                                                                                  |
| `security/` | The auth data model (`createAuthModel`, `hashPassword`, `hasRole`, ...), its config, the auth models (`resources/`), the `database` security store |
| `storage/`  | `FileService`, the File model and the image config                                                                                                 |
| `seeder/`   | `createSeeder` and the Seeder model                                                                                                                |
| `export/`   | `ExportService` (CSV)                                                                                                                              |
| `types/`    | The auth and storage types, and the generated types of the framework models (`generated.ts`)                                                       |
| `utils/`    | Helpers shared by the modules or meant for library users: export, file, model, policy and virtual field utilities                                  |
| `prisma/`   | The generated Prisma schema, client and migration of the framework models                                                                          |

**Data development scripts** (run from `packages/data`):

```bash
# Generate TypeScript types and Prisma schema from resource model files
# Scans all model.ts files, emits typed interfaces + a Prisma schema, and
# places the generated Prisma client at ./prisma/client.
npm run generate

# Completely reset and recreate the development database
# Use whenever the schema has changed substantially and you want a clean slate.
npm run db:recreate
```

**IMPORTANT**: whenever a resource schema in `packages/data` changes — any `model.ts` under `security/resources/`,
`storage/resources/`, `seeder/resources/`, etc. (adding, removing, or altering a scalar, relation, virtual field, or
index) — you must regenerate the types and the Prisma directory contents, then recreate the test database:

```bash
cd packages/data
npm run generate      # refresh types/generated.ts, prisma/schema.prisma and prisma/client
npm run db:recreate   # drop dev.db and prisma/migrations, then recreate the init migration from the new schema
```

The `appweaver.json` of `packages/data` (never published) turns on the `KEEP_DATABASE_TABLE` keys of the API keys,
the security store and the connected accounts, so `npm run generate` emits every framework model whatever the
environment.

A stale `prisma/client` makes Prisma reject writes with a misleading "Unknown argument" naming an *unrelated* field
(usually `createdById`) — suspect regeneration before the calling code.

`weaver generate` runs from the built `node_modules/@appweaver/cli`, and the model files of `data` import the built
`@appweaver/core` and `@appweaver/common`, so run `npm run build` before `npm run generate` (if the build fails on the
stale types, it still emits: run
`node tools/copy-packages.js`, generate, then build again).

Downstream sample projects need the same refresh; in `sample/cms-api` use `npm run generate` then
`weaver migration new <name>`, since it keeps a real migration history.

### `packages/web`

The HTTP module (`@appweaver/web`), built on Fastify. Its manifest `requires` `@appweaver/data`, and its `setup` loads
the resource routes of the application (`RESOURCE_ROUTES_PATTERN`), then the `web` part of every module. It augments
`Application` with `app.server` and `app.spec()`.

| Module      | Purpose                                                                                                                                        |
|-------------|------------------------------------------------------------------------------------------------------------------------------------------------|
| `server/`   | Fastify server creation, the `HttpServer` lifecycle service, `registerRoute`, `registerPlugin`, `registerModel`, Swagger/OpenAPI               |
| `resource/` | The resource routes and their schemas, the route loader (the `setup`) and the route `utils/`                                                   |
| `factory/`  | `createRoutes`                                                                                                                                 |
| `security/` | Authentication and authorization — `AuthService`, JWT, OAuth2, API key, basic auth, reCAPTCHA, Turnstile, account management, `access-util.ts` |
| `errors/`   | The API error layer: error code to HTTP status map (`errorHttpMap`), RFC 9457 problem details, error handler and `errorResponses` schemas      |
| `health/`   | The health check routes and their config                                                                                                       |
| `cache/`    | The response caching of the routes                                                                                                             |
| `storage/`  | The file routes                                                                                                                                |
| `template/` | The template preview route of development                                                                                                      |
| `types/`    | The `Server` and `Router` types, the Fastify extensions and the HTTP auth types                                                                |

### Driver packages

`packages/{redis,bullmq,cron,nodemailer,handlebars,sharp}` each hold one driver, its `module.ts` manifest and, when it
has one, its `config.ts` section. The library a driver wraps is a dependency of its package, so an application
installs `@appweaver/redis`, never `ioredis`.

| Package                 | Driver                     | Provider                        | Config                          |
|-------------------------|----------------------------|---------------------------------|---------------------------------|
| `@appweaver/redis`      | `RedisMemory`              | `redis` (`Memory`)              | `redisConfig` (`memory.redis`)  |
| `@appweaver/bullmq`     | `BullQueue`                | `bullmq` (`Queue`)              | — (requires `@appweaver/redis`) |
| `@appweaver/cron`       | `CronScheduler`            | `cron` (`Scheduler`)            | —                               |
| `@appweaver/nodemailer` | `SmtpMailer`               | `smtp` (`Mailer`)               | `smtpConfig` (`mailer.smtp`)    |
| `@appweaver/handlebars` | `HandlebarsTemplateEngine` | `handlebars` (`TemplateEngine`) | —                               |
| `@appweaver/sharp`      | `SharpImageProcessor`      | `sharp` (`ImageProcessor`)      | —                               |

### `packages/testing`

`@appweaver/testing` holds the test helpers of the packages and their modules: `resetContext` (clears the application
context between tests), `linkModels` (links the models defined in a test), `createDatabaseStub` (records the queries of
a stubbed Prisma client), `prismaError` and `sourceLoggerNames` (the `createLogger` names of a source directory, the
`loggers` of a manifest are checked against). The tests of `data`, `web` and the drivers import them from
`@appweaver/testing`, and the other packages by their names (`@appweaver/core`, `@appweaver/data`), never by a relative
path into another package. Jest maps every `@appweaver/*` import to the sources of its package (`moduleNameMapper` of
`jest.config.json`), so the tests need no build and share one instance of each module.

The contract suites of `contracts/` test a driver against the behavior every driver of its contract shares:
`testMemoryContract`, `testStorageContract`, `testQueueContract`, `testSchedulerContract` and `testMailerContract`,
each called as `(name, () => driver)` at the top level of a test file. They use the `describe`, `test`, `beforeEach`,
`afterEach` and `expect` globals, so they run under Jest, Vitest and Bun, and create a fresh driver for every test.
`InMemory`, `RedisMemory` (on `ioredis-mock`, which runs its Lua scripts), `FilesystemStorage`, `MemoryQueue`,
`JsonMailer` and `CronScheduler` run them, and so does the test of a driver package scaffolded with
`npm create @appweaver module`. A change of a contract's shared behavior goes into its
suite, so every driver is held to it.

### `packages/cli`

The `weaver` CLI tool. Entry point: `weaver.ts` → compiled to `dist/weaver.js`.

It needs only `@appweaver/core`. `@appweaver/data` and `@appweaver/web` are optional peer dependencies, loaded lazily by
the commands needing them (`importPackage` of `utils/package-util.ts`): `generate`, `test setup` and `seed` need data,
`openapi` needs web. Without the package, they exit with `weaver <command> needs the <package> package` (`openapi`
with a message naming the disabled `@appweaver/web` module).

See **Section 5** for the full command reference.

### `packages/client`

A type-safe HTTP client generator and runtime library for consuming Appweaver-compatible APIs. It consists of two parts:

- **Code generator** — reads an OpenAPI v3 schema (JSON or YAML, from a file or URL) and emits typed TypeScript
  interfaces and a client class tailored to the API's resources, auth, account, health, and file routes.
- **Runtime library** — provides `FetchClient` and a set of module clients (`ResourceClient`, `AuthClient`,
  `AccountClient`, `HealthClient`, `FilesClient`) that wrap `openapi-fetch` with built-in authentication strategies (JWT
  Bearer, API key, HTTP Basic), timeout handling, and middleware support.

The package exposes a `weaver-client` CLI binary. See **Section 6** for the full command reference.

**Key source locations:**

| Path                            | Purpose                                                              |
|---------------------------------|----------------------------------------------------------------------|
| `weaver-client.ts`              | CLI entry point                                                      |
| `commands/generate-command.ts`  | `generate` command — schema I/O and file writing                     |
| `generators/generate-types.ts`  | OpenAPI → TypeScript type definitions                                |
| `generators/generate-client.ts` | OpenAPI → typed client class                                         |
| `utils/hoist-util.ts`           | Hoists the schemas a document repeats inline into shared definitions |
| `utils/enum-util.ts`            | Rewrites the generated enums into constant objects and value unions  |
| `utils/problem-util.ts`         | Inlines the error codes of every error response, names `ErrorCode`   |
| `clients/fetch-client.ts`       | `FetchClient` base class with auth/middleware                        |
| `clients/modules/`              | `ResourceClient`, `AuthClient`, `AccountClient`, etc.                |
| `errors/client-error.ts`        | `ClientError` with the HTTP status, error code and problem details   |
| `constants.ts`                  | OpenAPI extension keys and operation/type mapping tables             |

---

### `packages/create`

The `@appweaver/create` package is the scaffolding tool that generates new Appweaver applications and module packages.
It exposes the **`create-appweaver`** CLI binary (entry point `create.ts`), run as `npm create @appweaver <name>` or
`npx @appweaver/create <name>`, and as `npm create @appweaver module <package>` for a module package.

A generated project starts from the base template (`templates/base/`), a minimal application of the core module, and
adds the optional modules selected: the default ones (`defaultModules` of `scaffold/modules.ts`, `data` and `web`)
with the `--add <modules...>` ones, or every module with `--all`, minus the `--exclude <modules...>` ones, which leave
out the default modules too, with or without `--all` (`--exclude data web` for the core application alone). The
modules are `data`, `web` (requires `data`), `redis`, `queue` (requires `redis`), `scheduler`, `mailer`, `templates`,
`locales` and `docker`. The base project depends only on `@appweaver/cli`, `common`, `core` and TypeBox, and a module
adds its
packages: `@appweaver/data`, `@appweaver/sharp`, Prisma and the driver adapter of `--database` (`data`, its
`projectPackages`), `@appweaver/web` (`web`), `@appweaver/redis` (`redis`), `@appweaver/bullmq` (`queue`),
`@appweaver/cron` (`scheduler`), `@appweaver/nodemailer` (`mailer`) and `@appweaver/handlebars` (`templates`), every
`@appweaver/*` package at the framework version, the version of `@appweaver/create` (`scaffold/package-versions.ts`).
`--database`, `--host` and `--port` configure `data` and `web` only (`ProjectContext`), and `weaver module add` takes
`--database` for `data`. The `User` auth model and its admin seeder come with `web`, which brings the authentication, so
a project with `data` alone has no auth model. A module sets values in the other JSON files of the project with its
`jsonFiles` (the
`package.json` scripts of `data`, the Jest e2e `globalSetup`), and a module file at the path of a base file replaces it
while unchanged, restored on removal (the `/api` e2e test of `web`).
The scaffolding engine lives in `scaffold/` and is exported as
`@appweaver/create/scaffold`, which `weaver module add|remove` of `packages/cli` uses on an existing
project, so both apply the same templates. `@appweaver/cli` depends on `@appweaver/create` at its exact
version (`tools/copy-packages.js` pins the `@appweaver/*` dependencies of the published manifests).

| Path                                | Purpose                                                                                                              |
|-------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| `create.ts`                         | CLI entry point: the project program (options, module selection, agent files, installation) and the `module` program |
| `scaffold/create-module-package.ts` | `createModulePackage` and `moduleShortName`, a module package from `templates/module-package/`                       |
| `scaffold/modules.ts`               | The module catalog: packages, requirements, `appweaver.json` values when enabled / disabled                          |
| `scaffold/apply-modules.ts`         | `enableModules` / `disableModules`, and the integrations between two modules                                         |
| `scaffold/create-project.ts`        | The base template, the disabled modules' config, then `enableModules`                                                |
| `scaffold/load-project.ts`          | Reads an existing project and its enabled modules (from its packages or marker files)                                |
| `scaffold/project-files.ts`         | `ProjectFiles`, staging the writes and deletions until `commit` (dry runs print them)                                |
| `scaffold/compose-util.ts`          | Adds and removes the Redis service of `docker-compose.yml` with the `yaml` document API                              |
| `templates/base/`                   | The minimal core application every module is added to                                                                |
| `templates/modules/<name>/`         | The files of a module, deleted when it is removed                                                                    |
| `templates/modules/<a>+<b>/`        | The files of two modules enabled together (`mailer+templates` holds the email templates)                             |
| `templates/translations/en.json`    | The English texts of the scaffolded templates, merged into `locales/en.json` with the mailer                         |
| `templates/module-package/`         | The files of every module package (`common/`), and those of each contract (`storage/`, `mailer/`, `none/`)           |

**Module packages**: `create-appweaver module <package> [description] [--contract storage|mailer|none] [-o dir]`
(selected by `module` as the first argument) creates a package in `-o` (by default the package name without its scope)
from `templates/module-package/common/` and the directory of its contract:

- `package.json` with the `appweaver.module` field (`./dist/module.js`) and the keyword `appweaver-module`,
  `@appweaver/common`, `@appweaver/core` and TypeBox as peer dependencies, `@appweaver/testing` and the test tooling
  (the `scaffoldDependencies` versions) as dev dependencies
- `src/module.ts` (the manifest, with the framework range), `src/config.ts` (its section) and `src/index.ts`
- for a driver, the class `<Name>Storage` (`src/storage.ts`) or `<Name>Mailer` (`src/mailer.ts`), a working in-memory
  stub, and a test running the contract suite of `@appweaver/testing`; for a feature module (`none`, the default),
  `src/main.ts` and a test of the manifest, checking its `loggers` against the sources
- `tsconfig.json`, `tsconfig.build.json`, `jest.config.json`, `.gitignore` (the template is `gitignore`, since npm
  leaves the `.gitignore` files out of a published package) and `README.md`

The short name (`moduleShortName`) strips the scope and the `appweaver-` prefix (`@acme/appweaver-gcs` → `gcs`) and is
the provider name. The config section is `<contract>.<name>` for a driver (`storage.gcs`), `<name>` for a feature
module, both in camelCase. Only `storage` and `mailer` have a driver template, a driver of another contract starts as a
feature module.

A template file can have runtime-specific variants:

- **`.tpl`** extension: Template files whose `{{VARIABLE}}`s are replaced (e.g., `index.ts.tpl` → `index.ts`).
- **`.node`** extension: Node.js-specific files that are only included when generating a project for the Node runtime.
- **`.bun`** extension: Bun-specific files that are only included when generating a project for the Bun runtime,
  replacing the file without the extension.

A module is defined by data (packages, config values) and its files, its edits of the base files are an integration of
the module alone in `apply-modules.ts` (the database password of `.env`, the SQLite rules of `.gitignore`), and anything
else it adds to another enabled module is an integration of the two (the database, Redis and
server parts of `docker-compose.yml`, the Dockerfile `COPY` blocks of public files, templates, locales and Prisma, the
database roles of `start.sh`, the `emails` texts the mailer merges into `locales/en.json`).
`@appweaver/create` creates the base project with every module's disabled config, then adds the selected modules
exactly like `weaver module add`, so a test checks that every combination of modules created, added one at a time, or
removed from a full project gives the same files. Keep any new module or
integration reversible: removal deletes its files and restores the config and packages.

Templates and localization are scaffolded independently. Without `locales`, every `{{t "key"}}` of the scaffolded
templates is replaced with the English message of the key in `templates/translations/en.json`, using
`utils/translation-util.ts` (a plural becomes an `{{#if (eq count 1)}}` chain). Write the scaffolded templates with `t`
calls only, a test checks that
both variants render the same text.

The versions of every npm package a generated project installs (except the `@appweaver/*` packages, which follow the
CLI's own version) are kept in the `scaffoldDependencies` field of the **root** `package.json`, split into `companion`
(packages the framework uses as a peer: Prisma and its driver adapters, TypeBox, TypeScript) and `tooling` (lint and
test setup). The base template receives them through the `{{DEPENDENCIES}}` and `{{DEV_DEPENDENCIES}}` variables, and
the modules write theirs into `package.json`, so bump versions there, not in the templates. Keep the versions equal
to the root `dependencies` and `devDependencies`, which a test checks. The libraries of the drivers (BullMQ, Cron,
Handlebars, IoRedis, Nodemailer, Sharp) are not among them, since they are dependencies of the driver packages.

A package lists the root fields it needs in its own `rootFields` array (`cli` and `create` list
`scaffoldDependencies`). `tools/copy-packages.js` copies them into `dist/package.json` and strips `rootFields`, the same
way it handles `files`, so the published manifests carry them. Running from the sources, as the tests do,
`scaffold/package-versions.ts` reads the field from the root `package.json` instead. `weaver upgrade` reads it from the
target `@appweaver/cli` release in the registry.

## 5. CLI Command Reference (`weaver`)

All commands are available via `weaver <command>`. Every command takes `-h, --help`, and the program takes
`-v, --version`. Defaults marked "from config" come from `appweaver.json` or the matching environment variable.

---

### `weaver build` (alias: `b`)

Build the application in the current project.

```
weaver build [options]
```

| Option                 | Description                     | Default               |
|------------------------|---------------------------------|-----------------------|
| `-p, --project [path]` | TypeScript project config file. | `tsconfig.build.json` |

1. Removes the build directory (`APP_BUILD_PATH`, `./dist` by default).
2. Runs `tsc -p <project>`.
3. Runs `tsc-alias` to resolve path aliases in emitted JS.

---

### `weaver config` (alias: `cfg`)

Inspect the configuration of the application. Every subcommand creates the application without starting it, so the
enabled modules and the application files have defined their config sections (`configSections` of
`@appweaver/common`).

```
weaver config schema [options]
weaver config print
weaver config check
```

#### `weaver config schema`

| Option                     | Description                          | Default                   |
|----------------------------|--------------------------------------|---------------------------|
| `-o, --output-path [path]` | Output path for the generated schema | `./appweaver.schema.json` |

Writes the JSON Schema of `appweaver.json` (`config/config-schema.ts`): every key under its camelCase name in the
nested object of its section, with its type and default, under `config` and each `environments.<env>`.
`weaver generate` writes the same file from the sections the enabled modules list in their manifests, without creating
the application, so only a section defined outside a module needs `weaver config schema`. The `$schema` of
`appweaver.json` points to it, so the editor knows the sections of the installed module packages too. The
`loggers` of the enabled modules become the suggested keys of `log.levels`, any other name still allowed.

#### `weaver config print`

Prints the environment, then every flattened key sorted by name, with its source and value (`config/config-report.ts`).
The source comes from `configSource(key)` of `@appweaver/common`: `override` (`configOverrides`), `env` (the
environment and the `.env` files), `json` (the `appweaver*.json` files) or `default`. A value is hidden as `********`
when its key ends with `PASSWORD`, `SECRET`, `TOKEN`, `PRIVATE_KEY`, `CREDENTIALS` or `API_KEY`, or its schema has the
`secret: true` option (`Type.String({ secret: true })`). The errors of the sections failing to parse follow the table,
with exit code 1.

#### `weaver config check`

Parses every section and exits with 1, listing the errors, when one is invalid. An error names only the invalid keys of
its section, each with its environment variable and JSON path. Run it in CI for the deployed environment,
`NODE_ENV=prod weaver config check`.

---

### `weaver generate` (alias: `g`)

Generate TypeScript types and/or a Prisma schema from resource model files.

```
weaver generate [options]
```

| Option                        | Description                                         | Default                   |
|-------------------------------|-----------------------------------------------------|---------------------------|
| `-t, --types`                 | Generate TypeScript types only                      | —                         |
| `-s, --schema`                | Generate Prisma schema (and client) only            | —                         |
| `--model-pattern [pattern]`   | Glob for model files                                | from config               |
| `--types-path [path]`         | Output path for generated types                     | from config               |
| `--schema-path [path]`        | Output path for Prisma schema                       | from config               |
| `--client-path [path]`        | Output path for Prisma client                       | from config               |
| `--no-registry`               | Skip registering the model types                    | registered                |
| `--no-prune`                  | Keep the framework models not used                  | pruned                    |
| `--config-schema-path [path]` | Output path for the JSON Schema of `appweaver.json` | `./appweaver.schema.json` |
| `--no-config-schema`          | Skip writing the JSON Schema of `appweaver.json`    | written                   |
| `--verbose`                   | Verbose output                                      | false                     |

Running with no flags generates **both** types and schema. With the types, it writes the JSON Schema of
`appweaver.json` from the config sections the enabled modules list (`appweaver.schema.json`, like
`weaver config schema`). The generated types register every model in the
`ResourceRegistry` of `@appweaver/common`, so the factories and `injectService` infer the model types from a model
name, and without any model the file holds only `export {};`. On SQLite a `json` default is written as the quoted SQL
literal `@default(dbgenerated("'{}'"))`, since the migrations of Prisma write a plain JSON default unquoted. The models
come from the project and from the `resources` of the enabled modules. The framework models are left
out unless used: `Role`, `Permission`, `ApiKey`, `OneTimeToken` and `ConnectedAccount` without an auth model, `File`
without a model declaring `files`, `Seeder` without a seeders directory (`data/resource/utils/prune-util.ts`). The
`npm run generate` of `packages/data` passes `--no-registry`, `--no-prune` and `--no-config-schema`, since the
registry and the config belong to the application and data keeps every model.

The registry belongs to the application, so a model is registered once: run in a module package (its `package.json` has
the `appweaver.module` field), `weaver generate` never writes the registry, and in an application it leaves out the
models of a module package whose declaration files already augment `ResourceRegistry`, with a warning naming them
(`shipsResourceRegistry` of `utils/loader-util.ts`).

---

### `weaver migrate` (alias: `mge`)

Apply pending database migrations (production / CI).

```
weaver migrate
```

Executes `prisma migrate deploy`.

---

### `weaver migration` (alias: `mgn`)

Database migration commands for development.

#### `weaver migration new <name>`

Create a new database migration.

```
weaver migration new <name>
```

Executes `prisma migrate dev --name <name>`.

#### `weaver migration reset`

Reset the database (drops all data and re-applies migrations). Allowed only in the `dev` and `test` environments
unless `--force` is passed.

```
weaver migration reset [options]
```

| Option        | Description                                  | Default |
|---------------|----------------------------------------------|---------|
| `-f, --force` | Force reset for non-development environments | false   |
| `-y, --yes`   | Skip confirmation prompt                     | false   |

Executes `prisma migrate reset` (with `--force` when `-y` or `-f` is passed).

Every `weaver migration` and `weaver test` command calls `setAiDangerousActionConsent` before `prisma migrate dev` or
`prisma migrate reset`, giving Prisma the consent of `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` for an AI agent
unless `DATABASE_AI_DANGEROUS_ACTIONS_ENABLED` is `false`. Call it before any new Prisma command that may lose data.

---

### `weaver module` (alias: `mod`)

Add and remove the optional modules of `@appweaver/create` (`data`, `web`, `redis`, `queue`, `scheduler`, `mailer`,
`templates`, `locales`, `docker`) in the current project, with the scaffold templates of `@appweaver/create/scaffold`,
install
module packages, and create local modules.

```
weaver module list                         (alias: ls)
weaver module new <name> [--dry-run]
weaver module add <modules...> [options]
weaver module remove <modules...> [options] (alias: rm)
```

| Option         | Description                                                  | Default   |
|----------------|--------------------------------------------------------------|-----------|
| `-f, --force`  | `add` only: overwrite the existing files instead of skipping | false     |
| `--database`   | `add` only: the database of the `data` module                | `sqlite`  |
| `--dry-run`    | Print the file changes without applying them                 | false     |
| `--no-install` | Skip the installation of the dependencies                    | installed |
| `--verbose`    | Verbose output                                               | false     |

`add` brings in the required modules too, `remove` refuses to remove a module a remaining one requires. Removing a
module deletes its files (the whole `templates/`, `locales/` or `database/` directory, the Docker files) and reverts its
`appweaver.json` values and packages; in `src/` and `database/seeders/` it deletes only the unchanged files of `web`
(the `User` resource and its admin seeder), keeping the changed ones with a warning, like a changed base file a module
replaced (the e2e test of `web`). Removing `data` warns of the files written in `database/migrations/` and
`database/seeders/` it deletes with `database/` (the `projectDirs` of the module). With `--database` and no `data`
added, `add` reports the option as ignored. The enabled modules are read from the project's
dependencies, and for `locales` and `docker` from the `locales/` directory and the `Dockerfile`.

`new <name>` creates a local module in `<APP_SOURCE_PATH>/modules/<name>/` (`module/local-module.ts`), enabled by
`APP_MODULES_PATTERN`: `module.ts` (the manifest, with its `loggers` and commented `providers` and `services`),
`config.ts` (the section
named after the camelCase of the name, `audit-log` → `auditLog`, with an `ENABLED` key) and `main.ts`. The name must be
kebab-case, and the command fails without writing anything when a file of the module exists. `--dry-run` prints the
files.

`add` also takes package names (`module/package-module.ts`): a name that is not a scaffold module, with a scope, a `-`
or a `/`, is a package (any other name is a scaffold module, so a typo is reported as unknown). The packages are
installed with `npm install --ignore-scripts <packages...>` (`bun add` on Bun), so
their install scripts never run, then each is described from the manifest of the `appweaver.module` field of its
`package.json`: the providers it brings, selected in the provider key of their contract, and the modules it requires.
A package without the field or a valid manifest is reported as not a module. With `--dry-run` the command prints the
install command instead, and with `--no-install` it only adds the packages to `package.json` and the lockfile
(`--package-lock-only`, `--lockfile-only` on Bun). A manifest is marked with `Symbol.for('appweaver.module')`, so
`isModule` recognizes it
whichever copy of `@appweaver/common` defined it.

---

### `weaver openapi` (alias: `oa`)

Generate the application's OpenAPI specification schema. Creates the application without starting it.

```
weaver openapi [options]
```

| Option                     | Description                                            | Default          |
|----------------------------|--------------------------------------------------------|------------------|
| `-o, --output-path [path]` | Output path for the generated OpenAPI specification    | `./openapi.json` |
| `-f, --format [format]`    | Output format for the specification (`json` or `yaml`) | `json`           |

With `--format yaml` and the default output path, the specification is written to `./openapi.yaml`. Fails with a message
when the `@appweaver/web` module is not installed or disabled.

---

### `weaver run` (alias: `r`)

Run a one-shot task with the application.

```
weaver run <file> [args...]
```

Creates the application without starting its server, its health listener or its scheduled jobs (`SERVER_LISTEN`,
`HEALTH_CHECK_PORT` and `SCHEDULER_AUTO_START_JOB` are forced off), runs the default export of the file,
`(args: string[]) => number | void`, with the arguments after the file,
stops the application, and exits with the returned number (`0` otherwise, `1` when the task throws). On Node a `.ts`
path runs from the build output (`src/tasks/report.ts` from `dist/src/tasks/report.js`).

---

### `weaver seed` (alias: `sd`)

Seed the database with initial data.

```
weaver seed [options]
```

| Option                    | Description                                                | Default               |
|---------------------------|------------------------------------------------------------|-----------------------|
| `--seeders-path [path]`   | Seeders directory                                          | from config           |
| `-b, --build-project`     | Build the project before seeding                           | false                 |
| `-p, --project [path]`    | TypeScript project config file used by `--build-project`   | `tsconfig.build.json` |
| `-c, --continue-on-error` | Continue on seeder errors                                  | false                 |
| `-f, --fix-warnings`      | Fix seeder warnings (wrong checksum, deleted seeder files) | false                 |

The seeders of the enabled modules run first, each recorded under its module name (`billing/1-plans`), then the
seeders of the application. A missing seeders directory is skipped with a warning (its recorded seeders are not
reported as deleted), and only no accessible directory at all stops the command.

---

### `weaver start` (alias: `s`)

Start the application.

```
weaver start [options]
```

| Option                 | Description                                          | Default               |
|------------------------|------------------------------------------------------|-----------------------|
| `-p, --project [path]` | TypeScript project config file used in watch mode    | `tsconfig.build.json` |
| `-w, --watch`          | Watch mode — recompiles and restarts on file changes | false                 |

- **Normal mode**: `node <APP_BUILD_PATH>/<APP_MAIN_FILE_PATH>` (`./dist/src/main.js` by default), or `bun` for the Bun
  runtime.
- **Watch mode**: `tsc-watch` with alias resolution and server restart on each successful build, and on every change in
  the template and translation directories (`TEMPLATE_PATH`, `LOCALE_PATH`) while the last build succeeded. The Bun
  runtime runs the TypeScript sources directly and restarts on every change in `APP_SOURCE_PATH`, `TEMPLATE_PATH` and
  `LOCALE_PATH`. A burst of changes restarts the server once, and a directory that does not exist is not watched.

---

### `weaver test` (alias: `t`)

Has following subcommands for setting up the test environment: `setup`, `reset`, and `teardown`. All of them must be
run with `NODE_ENV=test`.

#### `weaver test setup`

Set up a temporary test database and storage directory.

```
weaver test setup [options]
```

| Option                      | Description               | Default     |
|-----------------------------|---------------------------|-------------|
| `-d, --dir [tempDir]`       | Temporary directory       | `./temp`    |
| `--model-pattern [pattern]` | Glob for model files      | from config |
| `--schema-path [path]`      | Prisma schema output path | from config |
| `--client-path [path]`      | Prisma client output path | from config |
| `--migration-name [name]`   | Initial migration name    | `init_test` |
| `--verbose`                 | Verbose output            | false       |

Steps: removes temp dir → creates storage dir → generates schema → resets the test database (`prisma migrate reset
--force`, since a database server keeps the tables of the last run) → runs initial migration. The storage, schema, and
client paths must lie inside the temporary directory.

#### `weaver test reset`

Reset test database contents and/or file storage without tearing down the directory.

```
weaver test reset [options]
```

| Option                | Description         | Default  |
|-----------------------|---------------------|----------|
| `-d, --dir [tempDir]` | Temporary directory | `./temp` |
| `--database`          | Reset database      | —        |
| `--storage`           | Reset file storage  | —        |
| `--verbose`           | Verbose output      | false    |

With no flags, resets **both** database and storage. The database is reset with `prisma migrate reset`, which Prisma
refuses to run for an AI agent without the user's consent, which the command gives unless
`DATABASE_AI_DANGEROUS_ACTIONS_ENABLED` is `false` (see `weaver migration`).

#### `weaver test teardown`

Remove the temporary test directory entirely.

```
weaver test teardown [options]
```

| Option                | Description         | Default  |
|-----------------------|---------------------|----------|
| `-d, --dir [tempDir]` | Temporary directory | `./temp` |
| `--verbose`           | Verbose output      | false    |

---

### `weaver upgrade` (alias: `up`)

Upgrade Appweaver packages in the current project.

```
weaver upgrade [packages...] [options]
```

| Argument      | Description                                                                                                              | Default                               |
|---------------|--------------------------------------------------------------------------------------------------------------------------|---------------------------------------|
| `[packages…]` | One or more package names to upgrade (e.g. `@appweaver/core @appweaver/cli`). Only `@appweaver/*` packages are upgraded. | All installed `@appweaver/*` packages |

| Option                       | Description                                                                           | Default  |
|------------------------------|---------------------------------------------------------------------------------------|----------|
| `--target-version [version]` | The version to upgrade the packages to.                                               | `latest` |
| `--no-skill`                 | Skip upgrading AI agent skill files in agent directories (`.claude`, `.agents`, …).   | upgraded |
| `--no-companions`            | Skip upgrading the companion packages (Prisma and its adapters, TypeBox, TypeScript). | upgraded |
| `--tooling`                  | Also upgrade the tooling packages (ESLint, Jest, SWC, Prettier…).                     | false    |
| `--dry-run`                  | Print the packages that would be upgraded without installing them.                    | false    |
| `-f, --force`                | Force upgrade despite `peerDependency` version mismatches.                            | false    |
| `--verbose`                  | Print verbose output.                                                                 | false    |

The companion packages the project already has are bumped to the exact versions in the `scaffoldDependencies` of the
target `@appweaver/cli` release (`npm view` / `bun info`), in the same install as the `@appweaver/*` packages so the
peer ranges resolve together. Missing packages are never added and newer ones never downgraded. A failed lookup falls
back to upgrading only the `@appweaver/*` packages.

---

## 6. Client Command Reference (`weaver-client`)

All commands are available via `weaver-client <command>`. The program takes `-v, --version` and `-h, --help`.

---

### `weaver-client generate` (alias: `g`)

Generate TypeScript types and/or a typed client class from an OpenAPI v3 schema.

```
weaver-client generate <schemaPath> [options]
```

`<schemaPath>` accepts a local file path, relative or absolute (including a Windows drive path such as
`C:\api\openapi.json`), or a URL (`http://`, `https://`, `file://`). The schema may be JSON or YAML.

| Option                 | Description                                                                                  | Default                   |
|------------------------|----------------------------------------------------------------------------------------------|---------------------------|
| `--output-path [path]` | Output path for both types and client (used when `--types-path`/`--client-path` are omitted) | `./generated/client.ts`   |
| `--types-path [path]`  | Output path for generated TypeScript types only                                              | same as `--output-path`   |
| `--client-path [path]` | Output path for generated client class only                                                  | same as `--output-path`   |
| `--client-name [name]` | Custom name for the generated client class                                                   | derived from schema title |
| `--framework [name]`   | Framework for the generated client class (`fetch` or `angular`)                              | `fetch`                   |
| `--types-only`         | Generate TypeScript types only, skip client class generation                                 | false                     |
| `--client-only`        | Generate the client class only, skip TypeScript types generation                             | false                     |
| `--no-types`           | Generate an untyped client class, without the TypeScript types                               | typed                     |

**Example:**

```bash
# Generate types + client from a local OpenAPI file
weaver-client generate ./openapi.json --output-path ./src/generated/client.ts

# Generate types only from a running server
weaver-client generate http://localhost:3000/openapi.json --types-only --output-path ./src/types/api.ts

# Separate output paths with a custom class name
weaver-client generate ./openapi.json \
  --types-path ./src/types/api.ts \
  --client-path ./src/client.ts \
  --client-name CmsApiClient
```

**Typical workflow with an Appweaver API:**

```bash
# 1. Export the API's OpenAPI spec
weaver openapi --output-path ./openapi.json

# 2. Generate the typed client
weaver-client generate ./openapi.json --output-path ./generated/client.ts
```

```ts
// 3. Use the generated client
import { createClient } from './generated/client';

const client = createClient({ baseUrl: 'http://localhost:5000', auth: { apiKey: 'myApiKey' } });
const users = await client.user.query({ filter: { enabled: true } });
```

**Runtime client authentication strategies:**

| Strategy   | Config shape                                       | Notes                                     |
|------------|----------------------------------------------------|-------------------------------------------|
| JWT Bearer | `{ jwt: string \| JwtAuthConfig \| AuthFn }`       | Optional refresh token support            |
| API Key    | `{ apiKey: string \| ApiKeyAuthConfig \| AuthFn }` | Configurable header (default `X-Api-Key`) |
| HTTP Basic | `{ basic: string \| BasicAuthConfig \| AuthFn }`   | Base64-encodes username:password          |

**Generated module clients and their operations:**

| Client           | Key operations                                                                                                                                                         |
|------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `ResourceClient` | `find`, `query`, `aggregate`, `create`, `update`, `replace`, `delete`, `export`, `uploadFiles`, `deleteFiles`, `bulkCreate`, `bulkUpdate`, `bulkReplace`, `bulkDelete` |
| `AuthClient`     | `login`, `logout`, `refresh`, `changePassword`, `exchangeToken`, `me`                                                                                                  |
| `AccountClient`  | `sendVerifyEmail`, `verifyEmail`, `verifyEmailRedirect`, `sendResetPassword`, `resetPassword`, `send2FACode`, `verify2FACode`                                          |
| `HealthClient`   | `check`, `ready`                                                                                                                                                       |
| `FilesClient`    | `public`, `protected`                                                                                                                                                  |

---

## 7. Sample Applications

### `sample/cms-api`

A reference CMS (Content Management System) API that demonstrates how to build a complete application with Appweaver. It
includes user authentication, posts with file uploads, role-based authorization, scheduled jobs, custom routes, plugins,
and the localized templates of its `templates/` and `locales/` directories (an HTML page, an XML export and an email).

#### Model definitions and code generation

Resource models live in `src/resources/<name>/model.ts`. Each model defines its fields (scalars), relations, file
uploads, virtual fields, and input restrictions using factory functions (`createModel`, `createAuthModel`).

After **any change** to a model file, you must regenerate the TypeScript types and Prisma schema:

```bash
# Generate types (src/types/generated.ts) and Prisma schema (database/schema.prisma)
weaver generate          # or: npm run generate

# Create a migration for the schema change
weaver migration new <name_of_change>   # e.g. new add_category_to_post
```

The two-step workflow is:

1. **`weaver generate`** — reads all `model.ts` files, emits `src/types/generated.ts` and `database/schema.prisma`, then
   runs `prisma generate` to produce the Prisma client in `database/client/`.
2. **`weaver migration new <name>`** — creates a new SQL migration in `database/migrations/` and applies it to the dev
   database.

To apply pending migrations in production or CI (without creating new ones), use:

```bash
weaver migrate            # or: npm run migrate
```

#### Starting the application

```bash
# Production mode (requires a prior build)
weaver build              # or: npm run build
weaver start              # or: npm run start

# Development mode (watches for changes, recompiles and restarts automatically)
weaver start --watch      # or: npm run dev
```

- **`weaver start`** runs `node ./dist/src/main.js`.
- **`weaver start --watch`** uses `tsc-watch` to recompile on file changes, resolves path aliases with `tsc-alias`, and
  restarts the server on each successful build, and on each change of a file in `templates/` or `locales/`.

#### Environment-based configuration

Configuration is loaded from the `appweaver.json` file in the project root. The framework loads its **base** `config`
and then deep-merges the **environment-specific** overrides chosen by the `NODE_ENV` environment variable, from lowest
to highest precedence:

| Source                                  | Loaded when                                                 |
|-----------------------------------------|-------------------------------------------------------------|
| `appweaver.json` → `config`             | Always (base configuration)                                 |
| `appweaver.json` → `environments.<env>` | `NODE_ENV` resolves to `<env>` (`development` → `dev`, ...) |
| `appweaver.<env>.json` → `config`       | The file exists (optional, i.e. mounted in a container)     |
| `.env`, `.env.<env>`, process env       | Always, overriding the JSON files                           |

The samples and the scaffolded projects keep every environment in `appweaver.json`. For example, its `config` sets the
server port, database URL, and app metadata, the `dev` section enables debug logging with pretty-printing, while the
`test` section redirects the database to a temporary path, selects the `memory` providers of the memory and the queue
and the `json` mailer, and disables the scheduler auto-start. Only `appweaver.json` may declare `environments`.

#### Seeding the database

Seeders live in `database/seeders/` and are executed in filename order:

```bash
weaver seed               # or: npm run seed
```

#### Testing

```bash
# Unit tests
npm run test

# End-to-end tests
npm run e2e
```

E2E tests use `weaver test setup` / `weaver test reset` / `weaver test teardown` to manage a temporary test database and
storage directory. Setup and teardown are wired for the whole run, but each test file must register the reset itself
with `afterAll(resetTestData, 10_000)`, declared after the hook that stops the application.

#### Docker

The included `Dockerfile` and `start.sh` support multiple entry points:

```bash
start.sh app          # Start the application server
start.sh migrations   # Apply database migrations
start.sh seed         # Seed the database
```

### Other samples

Scaffolded with `@appweaver/create`, each showcases a different part of the framework and documents it in its own
`README.md`. They follow the `cms-api` workflow above, with the differences listed here.

| Sample                   | Runtime | Database           | Showcases                                                                                                  |
|--------------------------|---------|--------------------|------------------------------------------------------------------------------------------------------------|
| `sample/webshop-api`     | Node    | PostgreSQL + Redis | Transactional checkout, BullMQ payment worker on a resource event, API key partner, localized order emails |
| `sample/hr-api`          | Node    | SQLite             | `Employee` auth model with UUIDv7 ids, permission based access, team policies, soft delete cascades        |
| `sample/helpdesk-api`    | Node    | MySQL (MariaDB)    | Non-auth customers connected by email, auto-assignment, SLA escalation job, cursor pagination              |
| `sample/movies-api-bun`  | Bun     | SQLite (libsql)    | Public cached catalog, join model with payload, OAuth2 sign-up, generated typed client                     |
| `sample/inbox-processor` | Node    | SQLite + Redis     | A file and API fed BullMQ pipeline with retries, a local module with a watcher service and routes          |
| `sample/reports-worker`  | Node    | SQLite             | No server: daily reports by cron, archive job, CSV import and report tasks, the health listener            |
| `sample/loan-calculator` | Node    | —                  | Core only (no data, no web): a local module, its config, a cached calculator service, `weaver run` tasks   |

- `reports-worker` (`--add scheduler docker --exclude web`) and `loan-calculator` (`--exclude data web`) show the
  applications without a
  server: the worker is kept running by its cron jobs and answers the health checks on `healthCheck.port`, the
  calculator starts, calculates and stops, and both do their work in `weaver run` tasks. `loan-calculator` has no
  database, so no migrations, seeders or e2e database setup.
- The PostgreSQL and MySQL samples start their database with `docker compose up -d postgres redis` (or `mysql`); their
  end-to-end tests run against a `-test` database of the same container.
- Like a generated project, every sample configures its database and Redis URLs in `appweaver.json`, referencing the
  database password of `.env` (copied from `.env.example`) as `${DB_PASSWORD}`, and the hosts as
  `${DB_HOST:-localhost}` and `${REDIS_HOST:-localhost}`, which the compose application services override. The database
  name and user are `${DB_NAME:-<sample name>}` and `${DB_USER:-<sample name>}`, also in the compose database service.
  The MySQL sample mounts `database/mariadb-init.sh`, granting its user the shadow and the test databases.
- The driver adapters of all the samples are root dev dependencies, so the samples run on the root `node_modules`.
- Each sample also declares every package it needs (`@appweaver/data`, `@appweaver/web` and the driver packages it
  uses, `@appweaver/sharp` for the image transforms), locked in its own `package-lock.json` (`bun.lock` for the Bun
  sample) to the published `@appweaver/*` release, so its Docker image builds with a clean install outside the
  monorepo. The lockfiles are regenerated after every release, or on demand with `npm run samples:lock`.
- The Node samples build before their end-to-end tests (`pree2e`), since the application loads the compiled `dist/src`.
- The Bun sample runs its scripts with `bun run`. Bun runs every test file in one process, where the application
  context is frozen once an application starts, so its end-to-end files share one application instead of resetting the
  database in between. `tools/copy-packages.js` writes an empty `tsconfig.json` into every package copied to
  `node_modules/@appweaver`, otherwise Bun would resolve their imports through the root `paths` to the package sources
  and load every package twice.

---

## 8. Releasing New Versions

The project uses **semantic-release** with conventional commits to automate versioning, changelog generation, and npm
publishing.

### Release workflow

```bash
# From the repository root:
npm run release
```

This runs the following steps automatically:

1. **`prerelease`** — checks the tokens (`tools/check-tokens.js`), then runs `npm run build -- --sourceMap false` to
   produce fresh `dist/` output for all packages.
2. **Commit analysis** (`@semantic-release/commit-analyzer`) — determines the next version (`patch` / `minor` / `major`)
   from commit messages since the last tag.
3. **Release notes** (`@semantic-release/release-notes-generator`) — builds human-readable notes.
4. **Changelog** (`@semantic-release/changelog`) — appends notes to `CHANGELOG.md`.
5. **Version bump** (`@semantic-release/npm`, no publish) — updates `version` in the root `package.json` and in the
   `package.json` of every published package, listed in `release.config.js` (and `tools/lock-samples.js`): `core`,
   `common`, `data`, `web`, `redis`, `bullmq`, `cron`, `nodemailer`, `handlebars`, `sharp`, `testing`, `cli`, `client`
   and `create`.
6. **Package copy** (`@semantic-release/exec`) — runs `node ./tools/copy-packages.js` to sync built packages into
   `node_modules/@appweaver`.
7. **Publish** (`@semantic-release/exec`) — publishes each package's `dist/` directory to the npm registry with
   `node ./tools/publish-package.js <package> <version>` (a Node script, since semantic-release runs its commands with
   `cmd.exe` on Windows), every package after the ones it depends on, skipping a version the registry already has, so a
   release failing halfway publishes the remaining packages when run again:
    ```bash
    cd packages/common/dist     && npm publish
    cd packages/core/dist       && npm publish
    cd packages/data/dist       && npm publish
    cd packages/web/dist        && npm publish
    cd packages/redis/dist      && npm publish
    cd packages/bullmq/dist     && npm publish
    cd packages/cron/dist       && npm publish
    cd packages/nodemailer/dist && npm publish
    cd packages/handlebars/dist && npm publish
    cd packages/sharp/dist      && npm publish
    cd packages/testing/dist    && npm publish
    cd packages/create/dist     && npm publish
    cd packages/cli/dist        && npm publish
    cd packages/client/dist     && npm publish
    ```
8. **Git commit** (`@semantic-release/git`) — commits the updated `package.json` files and `CHANGELOG.md` with a chore
   commit, then tags the release, and `@semantic-release/github` creates the GitHub release.
9. **Sample lockfiles** (`@semantic-release/exec`) — once the packages are published, runs
   `node ./tools/lock-samples.js <version> --commit`, which raises the `@appweaver/*` ranges of the samples to
   `^<version>`, pins their lockfile entries to the built `dist` manifests and their `npm pack` integrity (the exact
   published tarballs), adds the entries of the released packages a sample needs but its lockfile lacks (a package
   published for the first time, with the root workspace of `bun.lock`), lets npm and Bun resolve the rest of the tree,
   and commits the changes separately, since the
   release commit is made before the packages are published. The registry is never asked for the new release, so there
   is no wait for it to propagate.
10. **`postrelease`** — runs `git push --follow-tags` to push the commits and tag to the remote.

### Registry

All packages are published to the public @appweaver organization npm registry:

```
https://www.npmjs.com/package/@appweaver
```

Ensure your environment has a valid `NPM_TOKEN`, with the right to publish and create the packages of the scope, and a
`GITHUB_TOKEN` (or `GH_TOKEN`) for the GitHub release, before running a release; `tools/check-tokens.js` stops the
release when either one is missing or rejected.

### Commit message conventions

`semantic-release` derives the version bump from commit prefixes:

| Prefix                                            | Version bump |
|---------------------------------------------------|--------------|
| `fix:`                                            | patch        |
| `feat:`                                           | minor        |
| `feat!:` / `BREAKING CHANGE` footer               | major        |
| `chore:`, `docs:`, `style:`, `refactor:`, `test:` | no release   |

Never add attribution trailers or footers (`Co-Authored-By`, `Claude-Session`, `Generated with ...`) to commit messages
or pull request descriptions: semantic-release copies the commit messages into `CHANGELOG.md` and the release notes.

## 9. Agents Skill File

The [SKILL.md](./skill/SKILL.md) file provides a comprehensive guide for AI agents (such as Claude Code, Codex, Cursor,
or other coding assistants) working with Appweaver projects. It contains detailed documentation on the library's
architecture, conventions, APIs, and best practices to enable agentic development workflows.

### For new projects created with `@appweaver/create`

New projects scaffolded via `npm create @appweaver` include a `AGENTS.md` or `CLAUDE.md` file at the project root. This
file is a thin, project-owned stub that references the framework guidelines (`GUIDELINES.md`) copied into the agent's
skills directory (e.g. `.claude/skills/appweaver/GUIDELINES.md`). It can be freely extended with project-specific
instructions and is never overwritten by `weaver upgrade`, which refreshes only the skill files (including
`GUIDELINES.md`) inside the skills' directory.

### Updating skill files

Whenever major changes occur in the `./packages/**` packages of this library, such as new features, API modifications,
or breaking changes—both the library-level [SKILL.md](./skill/SKILL.md). This ensures that AI agents have accurate,
up-to-date information when working with new or existing Appweaver projects.
