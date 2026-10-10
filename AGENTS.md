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

Every CLI (`weaver`, `weaver-client`, `create-weaver-app`) uses **kebab-case** long flags (`--dry-run`,
`--model-pattern`). A flag that turns something off is declared as a Commander negation (`--no-install`,
`--no-skill`), which the action reads as the positive option (`command.getOptionValue('install')`, `true` unless the
flag is passed). Never add `--skipX` or camelCase flags. `-v` is reserved for `--version` on the program level, so
`--verbose` has no short form.

## 2. Testing

Tests are located in `packages/*/test` and use **Jest** with **SWC** for fast execution.

- **Running all tests**: `npm test`
- **Running specific tests**: `jest path/to/file.test.ts`
- **Type-checking the tests**: `npm run test:typecheck`

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
interfaces, type definitions, and helper utilities consumed by `packages/core` and `packages/cli`.

When changing the config schema in `packages/common/config/config.ts`, make sure to also update all the following files:

- **packages/common/config/config-type.ts**: types and comments
- **packages/common/config/schema.json**: JSON schema definitions
- **skill/references/configuration.md**: Skill for configuration usage by AI agents
- **appweaver.example.json**: example defaults as JSON properties
- **.env.example**: example defaults as env variables

### Errors

Code outside the API layer never throws an HTTP error. Every module throws a subclass of the abstract `AppweaverError`
of `packages/common/errors` (`ResourceError`, `AuthError`, `DatabaseError`, ...), carrying a code of the
`ErrorCode` enum and typed details. Only `core/errors` maps a code to its HTTP status (`errorHttpMap`) and responds
with RFC 9457 problem details. Wrap the errors of Prisma calls with `toDatabaseError`, which names the violated
constraint. When adding an error code:

- add it to `ErrorCode` in `packages/common/errors/error-code.ts`, prefixed with the module raising it
- add its details to `ErrorDetailsMap` in `packages/common/errors/error-details.ts`, unless it carries none
- map it in `errorHttpMap` of `packages/core/errors/error-http-map.ts` (a missing code fails to compile)
- list it in the `errorResponses` of the routes responding with it, and in `skill/references/errors.md`

### `packages/core`

Core application logic. Organized into the following modules:

| Module       | Purpose                                                                                                                                                   |
|--------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| `app/`       | Application lifecycle: bootstrapping, loading modules and providers, startup/shutdown hooks                                                               |
| `database/`  | Database client factory and Prisma setup                                                                                                                  |
| `server/`    | Fastify HTTP server creation, route registration, model mounting, Swagger/OpenAPI integration                                                             |
| `security/`  | Authentication and authorization — sub-modules for JWT, OAuth2, API key, basic auth, reCAPTCHA, account management, and security token storage (`store/`) |
| `resource/`  | CRUD resource lifecycle: loading, routing, schema validation, and service layer                                                                           |
| `factory/`   | Factory helpers for creating models, policies, routes, and services                                                                                       |
| `storage/`   | File upload and management — filesystem storage and file service/routes                                                                                   |
| `queue/`     | Background job queues — Bull (Redis-backed) and in-memory implementations                                                                                 |
| `scheduler/` | Cron job scheduling service                                                                                                                               |
| `seeder/`    | Database seeding utilities                                                                                                                                |
| `mailer/`    | Email service — SMTP and JSON (dev/test) mailer implementations                                                                                           |
| `cache/`     | Caching layer abstractions and implementations                                                                                                            |
| `context/`   | Dependency injection container and utility functions                                                                                                      |
| `health/`    | Health check endpoint and service registration                                                                                                            |
| `export/`    | Data export service (CSV and other formats)                                                                                                               |
| `events/`    | Node.js event emitter integration                                                                                                                         |
| `errors/`    | The API error layer: error code to HTTP status map, `defineErrors`, RFC 9457 problem details, error handler and `errorResponses` schemas                  |
| `types/`     | TypeScript type definitions (hand-written and generated)                                                                                                  |
| `utils/`     | Utility functions shared across modules or meant for library users (see the placement rule below)                                                         |

**Utility placement rule**: `core/utils` holds helpers shared by two or more modules, or ones useful to library users
directly. Helpers internal to a single module go in that module's own `utils/` directory (i.e. `core/resource/utils`),
keeping `core/utils` a leaf that depends only on `context` and `types` and so cannot form import cycles.

**Core development scripts** (run from `packages/core`):

```bash
# Generate TypeScript types and Prisma schema from resource model files
# Scans all model.ts files, emits typed interfaces + a Prisma schema, and
# places the generated Prisma client at ./prisma/client.
npm run generate

# Completely reset and recreate the development database
# Use whenever the schema has changed substantially and you want a clean slate.
npm run db:recreate
```

**IMPORTANT**: whenever a resource schema in `packages/core` changes — any `model.ts` under `security/resources/`,
`storage/resources/`, `seeder/resources/`, etc. (adding, removing, or altering a scalar, relation, virtual field, or
index) — you must regenerate the types and the Prisma directory contents, then recreate the test database:

```bash
cd packages/core
npm run generate      # refresh types/generated.ts, prisma/schema.prisma and prisma/client
npm run db:recreate   # drop dev.db, remove the *_init migration and recreate it from the new schema
```

A stale `prisma/client` makes Prisma reject writes with a misleading "Unknown argument" naming an *unrelated* field
(usually `createdById`) — suspect regeneration before the calling code.

`weaver generate` loads the core models from the built `node_modules/@appweaver/core`, not from source, so run
`npm run build` before `npm run generate` (if the build fails on the stale types, it still emits: run
`node tools/copy-packages.js`, generate, then build again).

Downstream sample projects need the same refresh; in `sample/cms-api` use `npm run generate` then
`weaver migration new <name>`, since it keeps a real migration history.

### `packages/cli`

The `weaver` CLI tool. Entry point: `weaver.ts` → compiled to `dist/weaver.js`.

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

### `packages/create-weaver-app`

The `create-weaver-app` module is a project scaffolding tool that generates new Appweaver applications. It exposes the
**`create-weaver-app`** CLI binary, which can be invoked via `npx create-weaver-app`.

The module uses a template-based generation system where each file can have runtime-specific variants:

- **`.tpl`** extension: Template files that are processed and copied to the new project (e.g., `index.ts.tpl` →
  `index.ts`).
- **`.node`** extension: Node.js-specific files that are only included when generating a project for the Node runtime.
- **`.bun`** extension: Bun-specific files that are only included when generating a project for the Bun runtime.

During project generation, the CLI accepts arguments for name, description, runtime (Node or Bun), and what modules to
skip installing. Then replaces the templates with defined variables, and copies only the relevant files based on the
chosen runtime, stripping the `.tpl`, `.node`, or `.bun` extensions from the final output.

The versions of every npm package a generated project installs (except the `@appweaver/*` packages, which follow the
CLI's own version) are kept in the `scaffoldDependencies` field of the **root** `package.json`, split into `companion`
(packages the framework uses at runtime or as a peer: Prisma, TypeBox, BullMQ, Cron, IoRedis, Nodemailer, TypeScript)
and
`tooling` (lint and test setup). The templates receive them through the `{{DEPENDENCIES}}` and `{{DEV_DEPENDENCIES}}`
variables, so bump versions there, not in the templates. Keep the versions equal to the root `dependencies` and
`devDependencies`, which a test checks.

A package lists the root fields it needs in its own `rootFields` array (`cli` and `create-weaver-app` list
`scaffoldDependencies`). `tools/copy-packages.js` copies them into `dist/package.json` and strips `rootFields`, the same
way it handles `files`, so the published manifests carry them. Running from the sources, as the tests do,
`create-weaver-app.ts` reads the field from the root `package.json` instead. `weaver update` reads it from the target
`@appweaver/cli` release in the registry.

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

### `weaver generate` (alias: `g`)

Generate TypeScript types and/or a Prisma schema from resource model files.

```
weaver generate [options]
```

| Option                      | Description                              | Default     |
|-----------------------------|------------------------------------------|-------------|
| `-t, --types`               | Generate TypeScript types only           | —           |
| `-s, --schema`              | Generate Prisma schema (and client) only | —           |
| `--model-pattern [pattern]` | Glob for model files                     | from config |
| `--types-path [path]`       | Output path for generated types          | from config |
| `--schema-path [path]`      | Output path for Prisma schema            | from config |
| `--client-path [path]`      | Output path for Prisma client            | from config |
| `--no-registry`             | Skip registering the model types         | registered  |
| `--verbose`                 | Verbose output                           | false       |

Running with no flags generates **both** types and schema. The generated types register every model in the
`ResourceRegistry` of `@appweaver/common`, so the factories and `injectService` infer the model types from a model
name. Core's own `npm run generate` passes `--no-registry`, since the registry belongs to the application.

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

With `--format yaml` and the default output path, the specification is written to `./openapi.yaml`.

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
- **Watch mode**: `tsc-watch` with alias resolution and server restart on each successful build. The Bun runtime runs
  the TypeScript sources directly and restarts on every change in `APP_SOURCE_PATH`.

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

Steps: removes temp dir → creates storage dir → generates schema → runs initial migration. The storage, schema, and
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

With no flags, resets **both** database and storage.

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

### `weaver update` (alias: `u`)

Update Appweaver packages in the current project.

```
weaver update [packages...] [options]
```

| Argument      | Description                                                                                                            | Default                               |
|---------------|------------------------------------------------------------------------------------------------------------------------|---------------------------------------|
| `[packages…]` | One or more package names to update (e.g. `@appweaver/core @appweaver/cli`). Only `@appweaver/*` packages are updated. | All installed `@appweaver/*` packages |

| Option                       | Description                                                                        | Default  |
|------------------------------|------------------------------------------------------------------------------------|----------|
| `--target-version [version]` | The version to update the packages to.                                             | `latest` |
| `--no-skill`                 | Skip updating AI agent skill files in agent directories (`.claude`, `.agents`, …). | updated  |
| `--no-companions`            | Skip updating the companion packages (Prisma, BullMQ, Cron, IoRedis, Nodemailer…). | updated  |
| `--tooling`                  | Also update the tooling packages (ESLint, Jest, SWC, Prettier…).                   | false    |
| `--dry-run`                  | Print the packages that would be updated without installing them.                  | false    |
| `-f, --force`                | Force update despite `peerDependency` version mismatches.                          | false    |
| `--verbose`                  | Print verbose output.                                                              | false    |

The companion packages the project already has are bumped to the exact versions in the `scaffoldDependencies` of the
target `@appweaver/cli` release (`npm view` / `bun info`), in the same install as the `@appweaver/*` packages so the
peer ranges resolve together. Missing packages are never added and newer ones never downgraded. A failed lookup falls
back to updating only the `@appweaver/*` packages.

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

| Client           | Key operations                                                                                                                |
|------------------|-------------------------------------------------------------------------------------------------------------------------------|
| `ResourceClient` | `find`, `query`, `aggregate`, `create`, `update`, `delete`, `export`, `uploadFiles`, `deleteFiles`                            |
| `AuthClient`     | `login`, `logout`, `refresh`, `changePassword`, `exchangeToken`, `me`                                                         |
| `AccountClient`  | `sendVerifyEmail`, `verifyEmail`, `verifyEmailRedirect`, `sendResetPassword`, `resetPassword`, `send2FACode`, `verify2FACode` |
| `HealthClient`   | `check`, `ready`                                                                                                              |
| `FilesClient`    | `public`, `protected`                                                                                                         |

---

## 7. Sample Applications

### `sample/cms-api`

A reference CMS (Content Management System) API that demonstrates how to build a complete application with Appweaver. It
includes user authentication, posts with file uploads, role-based authorization, scheduled jobs, custom routes, and
plugins.

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
  restarts the server on each successful build.

#### Environment-based configuration

Configuration is loaded from `appweaver.json` files in the project root. The framework loads a **base** config and then
deep-merges an **environment-specific** overlay based on the `NODE_ENV` environment variable:

| File                  | Loaded when                                 |
|-----------------------|---------------------------------------------|
| `appweaver.json`      | Always (base configuration)                 |
| `appweaver.dev.json`  | `NODE_ENV=dev` or `development`             |
| `appweaver.test.json` | `NODE_ENV=test`                             |
| `appweaver.prod.json` | `NODE_ENV=prod` or `production`, or not set |

For example, the base `appweaver.json` sets the server port, database URL, and app metadata. The dev overlay enables
debug logging with pretty-printing, while the test overlay redirects the database to a temporary path, swaps Redis and
queue providers for in-memory implementations, and disables the scheduler auto-start.

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

Scaffolded with `create-weaver-app`, each showcases a different part of the framework and documents it in its own
`README.md`. They follow the `cms-api` workflow above, with the differences listed here.

| Sample                  | Runtime | Database           | Showcases                                                                                            |
|-------------------------|---------|--------------------|------------------------------------------------------------------------------------------------------|
| `sample/webshop-api`    | Node    | PostgreSQL + Redis | Transactional checkout, BullMQ payment worker on a resource event, API key partner, sales aggregates |
| `sample/hr-api`         | Node    | SQLite             | `Employee` auth model with UUIDv7 ids, permission based access, team policies, soft delete cascades  |
| `sample/helpdesk-api`   | Node    | MySQL (MariaDB)    | Non-auth customers connected by email, auto-assignment, SLA escalation job, cursor pagination        |
| `sample/movies-api-bun` | Bun     | SQLite (libsql)    | Public cached catalog, join model with payload, OAuth2 sign-up, generated typed client               |

- The PostgreSQL and MySQL samples start their database with `docker compose up -d postgres redis` (or `mysql`); their
  end-to-end tests run against a `-test` database of the same container.
- The driver adapters of all the samples are root dev dependencies, so the samples run on the root `node_modules`.
- Each sample also declares every package it needs, locked in its own `package-lock.json` (`bun.lock` for the Bun
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

1. **`prerelease`** — runs `npm run build` to produce fresh `dist/` output for all packages.
2. **Commit analysis** (`@semantic-release/commit-analyzer`) — determines the next version (`patch` / `minor` / `major`)
   from commit messages since the last tag.
3. **Release notes** (`@semantic-release/release-notes-generator`) — builds human-readable notes.
4. **Changelog** (`@semantic-release/changelog`) — appends notes to `CHANGELOG.md`.
5. **Version bump** (`@semantic-release/npm`, no publish) — updates `version` in:
    - `package.json` (root)
    - `packages/core/package.json`
    - `packages/common/package.json`
    - `packages/cli/package.json`
    - `packages/client/package.json`
    - `packages/create-weaver-app/package.json`
6. **Package copy** (`@semantic-release/exec`) — runs `node ./tools/copy-packages.js` to sync built packages into
   `node_modules/@appweaver`.
7. **Publish** (`@semantic-release/exec`) — publishes each package's `dist/` directory to the npm registry:
    ```bash
    cd packages/core/dist    && npm publish
    cd packages/common/dist  && npm publish
    cd packages/cli/dist     && npm publish
    cd packages/client/dist  && npm publish
    ```
8. **Git commit** (`@semantic-release/git`) — commits the updated `package.json` files and `CHANGELOG.md` with a chore
   commit, then tags the release.
9. **Sample lockfiles** (`@semantic-release/exec`) — once the packages are published, runs
   `node ./tools/lock-samples.js <version> --commit`, which raises the `@appweaver/*` ranges of the samples to
   `^<version>`, pins their lockfile entries to the built `dist` manifests and their `npm pack` integrity (the exact
   published tarballs), lets npm and Bun resolve the rest of the tree, and commits the changes separately, since the
   release commit is made before the packages are published. The registry is never asked for the new release, so there
   is no wait for it to propagate.
10. **`postrelease`** — runs `git push --follow-tags` to push the commits and tag to the remote.

### Registry

All packages are published to the public @appweaver organization npm registry:

```
https://www.npmjs.com/package/@appweaver
```

Ensure your environment has a valid `NPM_TOKEN` (or `CI_JOB_TOKEN` in CI) with write access to this registry before
running a release.

### Commit message conventions

`semantic-release` derives the version bump from commit prefixes:

| Prefix                                            | Version bump |
|---------------------------------------------------|--------------|
| `fix:`                                            | patch        |
| `feat:`                                           | minor        |
| `feat!:` / `BREAKING CHANGE` footer               | major        |
| `chore:`, `docs:`, `style:`, `refactor:`, `test:` | no release   |

## 9. Agents Skill File

The [SKILL.md](./skill/SKILL.md) file provides a comprehensive guide for AI agents (such as Claude Code, Codex, Cursor,
or other coding assistants) working with Appweaver projects. It contains detailed documentation on the library's
architecture, conventions, APIs, and best practices to enable agentic development workflows.

### For new projects created with `create-weaver-app`

New projects scaffolded via `npx create-weaver-app` include a `AGENTS.md` or `CLAUDE.md` file at the project root. This
file is a thin, project-owned stub that references the framework guidelines (`GUIDELINES.md`) copied into the agent's
skills directory (e.g. `.claude/skills/appweaver/GUIDELINES.md`). It can be freely extended with project-specific
instructions and is never overwritten by `weaver update`, which refreshes only the skill files (including
`GUIDELINES.md`) inside the skills' directory.

### Updating skill files

Whenever major changes occur in the `./packages/**` packages of this library, such as new features, API modifications,
or breaking changes—both the library-level [SKILL.md](./skill/SKILL.md). This ensures that AI agents have accurate,
up-to-date information when working with new or existing Appweaver projects.
