# Project Guidelines

## 1. Build & Configuration

The project is a TypeScript monorepo using `tsc -b` for builds.

- **Initial Setup**: Run `npm install` to install all dependencies.
- **Building**: Run `npm run build` from the root. This performs:
    - `clean:packages`: Removes `dist` folders from all packages.
    - `tsc -b`: Incremental build of all packages.
    - `postbuild`: Cleans `node_modules/@appweaver` and copies built packages there via `tools/copy-packages.js` to
      allow packages to reference each other during development.
- **Development Mode**: Run `npm run build:dev` to watch for changes and rebuild automatically.

## 2. Testing

Tests are located in `packages/*/test` and use **Jest** with **SWC** for fast execution.

- **Running all tests**: `npm test`
- **Running specific tests**: `jest path/to/test.spec.ts`
- **Adding new tests**:
    - Create a file with `.spec.ts` or `.test.ts` extension in the `test` directory of the relevant package.
    - Follow the standard `describe`/`test`/`expect` pattern.

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
| `errors/`    | Custom application error classes                                                                                                                          |
| `types/`     | TypeScript type definitions (hand-written and generated)                                                                                                  |
| `utils/`     | Shared utility functions                                                                                                                                  |

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

### `packages/cli`

The `weaver` CLI tool. Entry point: `weaver.ts` → compiled to `dist/weaver.js`.

See **Section 5** for the full command reference.

### `packages/client`

A type-safe HTTP client generator and runtime library for consuming Appweaver-compatible APIs. It consists of two parts:

- **Code generator** — reads an OpenAPI v3 schema (JSON or YAML, from a file or URL) and emits typed TypeScript
  interfaces and a client class tailored to the API's resources, auth, account, health, and file routes.
- **Runtime library** — provides `FetchClient` and a set of module clients (`ResourceClient`, `AuthClient`,
  `AccountClient`, `HealthClient`, `FileClient`) that wrap `openapi-fetch` with built-in authentication strategies
  (JWT Bearer, API key, HTTP Basic), timeout handling, and middleware support.

The package exposes a `weaver-client` CLI binary. See **Section 6** for the full command reference.

**Key source locations:**

| Path                            | Purpose                                                  |
|---------------------------------|----------------------------------------------------------|
| `weaver-client.ts`              | CLI entry point                                          |
| `commands/generate-command.ts`  | `generate` command — schema I/O and file writing         |
| `generators/generate-types.ts`  | OpenAPI → TypeScript type definitions                    |
| `generators/generate-client.ts` | OpenAPI → typed client class                             |
| `clients/fetch-client.ts`       | `FetchClient` base class with auth/middleware            |
| `clients/modules/`              | `ResourceClient`, `AuthClient`, `AccountClient`, etc.    |
| `errors/client-error.ts`        | `ClientError` with HTTP status code and response object  |
| `constants.ts`                  | OpenAPI extension keys and operation/type mapping tables |

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

## 5. CLI Command Reference (`weaver`)

All commands are available via `weaver <command>`.

---

### `weaver build` (alias: `b`)

Build the application in the current project.

```
weaver build
```

1. Removes the `dist/` directory.
2. Runs `tsc -p tsconfig.build.json`.
3. Runs `tsc-alias` to resolve path aliases in emitted JS.

---

### `weaver generate` (alias: `g`)

Generate TypeScript types and/or a Prisma schema from resource model files.

```
weaver generate [options]
weaver g [options]
```

| Option                     | Description                     | Default     |
|----------------------------|---------------------------------|-------------|
| `-t, --types`              | Generate TypeScript types only  | —           |
| `-s, --schema`             | Generate Prisma schema only     | —           |
| `--modelPattern <pattern>` | Glob for model files            | from config |
| `--typesPath <path>`       | Output path for generated types | from config |
| `--schemaPath <path>`      | Output path for Prisma schema   | from config |
| `--clientPath <path>`      | Output path for Prisma client   | from config |
| `-v, --verbose`            | Verbose output                  | false       |

Running with no flags generates **both** types and schema.

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

Reset the database (drops all data and re-applies migrations).

```
weaver migration reset [options]
```

| Option        | Description                                  | Default |
|---------------|----------------------------------------------|---------|
| `-f, --force` | Force reset for non-development environments | false   |
| `-y, --yes`   | Skip confirmation prompt                     | false   |

Executes `prisma migrate reset` (with `--force` when `-y` is passed).

---

### `weaver openapi` (alias: `oa`)

Generate the application's OpenAPI specification schema.

```
weaver openapi [options]
```

| Option                    | Description                                            | Default          |
|---------------------------|--------------------------------------------------------|------------------|
| `-o, --outputPath [path]` | Output path for the generated OpenAPI specification    | `./openapi.json` |
| `-f, --format [format]`   | Output format for the specification (`json` or `yaml`) | `json`           |

---

### `weaver seed` (alias: `sd`)

Seed the database with initial data.

```
weaver seed [options]
```

| Option                  | Description               | Default     |
|-------------------------|---------------------------|-------------|
| `--seedersPath <path>`  | Seeders directory         | from config |
| `-b, --buildProject`    | Build before seeding      | false       |
| `-c, --continueOnError` | Continue on seeder errors | false       |

---

### `weaver start` (alias: `s`)

Start the application.

```
weaver start [options]
```

| Option        | Description                                          | Default |
|---------------|------------------------------------------------------|---------|
| `-w, --watch` | Watch mode — recompiles and restarts on file changes | false   |

- **Normal mode**: `node ./dist/src/main.js`
- **Watch mode**: `tsc-watch` with alias resolution and server restart on each successful build.

---

### `weaver test` (alias: `t`)

Has following subcommands for setting up the test environment: `setup`, `reset`, and `teardown`.

### `weaver test setup`

Set up a temporary test database and storage directory. Must be run with `NODE_ENV=test`.

```
weaver test setup [options]
```

| Option                     | Description               | Default     |
|----------------------------|---------------------------|-------------|
| `-d, --dir <tempDir>`      | Temporary directory       | `./temp`    |
| `--modelPattern <pattern>` | Glob for model files      | from config |
| `--schemaPath <path>`      | Prisma schema output path | from config |
| `--clientPath <path>`      | Prisma client output path | from config |
| `--migrationName <name>`   | Initial migration name    | `init_test` |
| `-v, --verbose`            | Verbose output            | false       |

Steps: removes temp dir → creates storage dir → generates schema → runs initial migration.

---

### `weaver test reset`

Reset test database contents and/or file storage without tearing down the directory.

```
weaver test reset [options]
```

| Option                | Description         | Default  |
|-----------------------|---------------------|----------|
| `-d, --dir <tempDir>` | Temporary directory | `./temp` |
| `--database`          | Reset database      | —        |
| `--storage`           | Reset file storage  | —        |
| `-v, --verbose`       | Verbose output      | false    |

With no flags, resets **both** database and storage.

---

### `weaver test teardown`

Remove the temporary test directory entirely.

```
weaver test teardown [options]
```

| Option                | Description         | Default  |
|-----------------------|---------------------|----------|
| `-d, --dir <tempDir>` | Temporary directory | `./temp` |
| `-v, --verbose`       | Verbose output      | false    |

---

### `weaver update` (alias: `u`)

Update Appweaver packages in the current project.

```
weaver update [packages...] [options]
```

| Argument      | Description                                                                                                            | Default                               |
|---------------|------------------------------------------------------------------------------------------------------------------------|---------------------------------------|
| `[packages…]` | One or more package names to update (e.g. `@appweaver/core @appweaver/cli`). Only `@appweaver/*` packages are updated. | All installed `@appweaver/*` packages |

| Option                      | Description                                                | Default  |
|-----------------------------|------------------------------------------------------------|----------|
| `--targetVersion [version]` | The version to update the packages to.                     | `latest` |
| `--noSkill`                 | Skip updating AI agent skill files in the current project. | false    |
| `-f, --force`               | Force update despite `peerDependency` version mismatches.  | false    |
| `--verbose`                 | Print verbose output.                                      | false    |

After a successful package update, skill files are automatically refreshed unless `--noSkill` is passed.

---

## 6. Client Command Reference (`weaver-client`)

All commands are available via `weaver-client <command>`.

---

### `weaver-client generate` (alias: `g`)

Generate TypeScript types and/or a typed client class from an OpenAPI v3 schema.

```
weaver-client generate <schemaPath> [options]
```

`<schemaPath>` accepts a local file path or a URL (`http://`, `https://`, `file://`). The schema may be JSON or YAML.

| Option                | Description                                                                                | Default                   |
|-----------------------|--------------------------------------------------------------------------------------------|---------------------------|
| `--outputPath [path]` | Output path for both types and client (used when `--typesPath`/`--clientPath` are omitted) | `./generated/client.ts`   |
| `--typesPath [path]`  | Output path for generated TypeScript types only                                            | same as `outputPath`      |
| `--clientPath [path]` | Output path for generated client class only                                                | same as `outputPath`      |
| `--clientName [name]` | Custom name for the generated client class                                                 | derived from schema title |
| `--typesOnly`         | Generate TypeScript types only, skip client class generation                               | false                     |
| `-v, --version`       | Output package version                                                                     | —                         |

**Generation steps:**

1. Reads and parses the OpenAPI schema (JSON or YAML).
2. Generates TypeScript interfaces/types via `openapi-typescript`, enriching them with JSDoc validation tags
   (`@minLength`, `@maxLength`, `@minimum`, `@maximum`, `@pattern`, `@format`).
3. Classifies all API paths into route groups: resources, auth, account, health, files, and custom.
4. Emits a typed client class extending `FetchClient<Paths>` with a getter for each route group.
5. Formats all output with Prettier.
6. Writes files with an autogenerated header comment.

**Example:**

```bash
# Generate types + client from a local OpenAPI file
weaver-client generate ./openapi.json --outputPath ./src/generated/client.ts

# Generate types only from a running server
weaver-client generate http://localhost:3000/openapi.json --typesOnly --outputPath ./src/types/api.ts

# Separate output paths with a custom class name
weaver-client generate ./openapi.json \
  --typesPath ./src/types/api.ts \
  --clientPath ./src/client.ts \
  --clientName CmsApiClient
```

**Typical workflow with an Appweaver API:**

```bash
# 1. Start the API and export its OpenAPI spec
weaver openapi --outputPath ./openapi.json

# 2. Generate the typed client
weaver-client generate ./openapi.json --outputPath ./generated/client.ts

# 3. Use the generated client
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

| Client           | Key operations                                                                                         |
|------------------|--------------------------------------------------------------------------------------------------------|
| `ResourceClient` | `find`, `query`, `aggregate`, `create`, `update`, `delete`, `export`, `uploadFiles`, `deleteFiles`     |
| `AuthClient`     | `login`, `logout`, `refresh`, `changePassword`, `exchangeToken`, `me`                                  |
| `AccountClient`  | `sendVerifyEmail`, `verifyEmail`, `sendResetPassword`, `resetPassword`, `send2FACode`, `verify2FACode` |
| `HealthClient`   | `check`, `ready`                                                                                       |
| `FileClient`     | `public`, `protected`                                                                                  |

---

## 7. Sample Applications

### `sample/cms-api`

A reference CMS (Content Management System) API that demonstrates how to build a complete application with Appweaver.
It includes user authentication, posts with file uploads, role-based authorization, scheduled jobs, custom routes, and
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

1. **`weaver generate`** — reads all `model.ts` files, emits `src/types/generated.ts` and `database/schema.prisma`,
   then runs `prisma generate` to produce the Prisma client in `database/client/`.
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
- **`weaver start --watch`** uses `tsc-watch` to recompile on file changes, resolves path aliases with `tsc-alias`,
  and restarts the server on each successful build.

#### Environment-based configuration

Configuration is loaded from `appweaver.json` files in the project root. The framework loads a **base** config and then
deep-merges an **environment-specific** overlay based on the `NODE_ENV` environment variable:

| File                  | Loaded when                     |
|-----------------------|---------------------------------|
| `appweaver.json`      | Always (base configuration)     |
| `appweaver.dev.json`  | `NODE_ENV=dev` or `development` |
| `appweaver.test.json` | `NODE_ENV=test`                 |

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

E2E tests use `weaver test setup` / `weaver test reset` / `weaver test teardown` to manage a temporary test database
and storage directory.

#### Docker

The included `Dockerfile` and `start.sh` support multiple entry points:

```bash
start.sh app          # Start the application server
start.sh migrations   # Apply database migrations
start.sh seed         # Seed the database
```

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
7. **Publish** (`@semantic-release/exec`) — publishes each package's `dist/` directory to the GitLab npm registry:
    ```bash
    cd packages/core/dist    && npm publish
    cd packages/common/dist  && npm publish
    cd packages/cli/dist     && npm publish
    cd packages/client/dist  && npm publish
    ```
8. **Git commit** (`@semantic-release/git`) — commits the updated `package.json` files and `CHANGELOG.md` with a chore
   commit, then tags the release.
9. **`postrelease`** — runs `git push --follow-tags` to push the commit and tag to the remote.

### Registry

All packages are published to the GitLab npm registry:

```
https://gitlab.com/api/v4/projects/77748589/packages/npm/
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
file is automatically generated to guide AI agents through the project's specific setup, structure, and usage patterns.
It serves as a project-level guideline using the [SKILL.md](./skill/SKILL.md).

### Updating skill files

Whenever major changes occur in the `./packages/**` packages of this library, such as new features, API modifications,
or breaking changes—both the library-level [SKILL.md](./skill/SKILL.md). This ensures that AI agents have accurate,
up-to-date information when working with new or existing Appweaver projects.
