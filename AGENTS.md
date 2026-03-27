### Project Guidelines

#### 1. Build & Configuration

The project is a TypeScript monorepo using `tsc -b` for builds.

- **Initial Setup**: Run `npm install` to install all dependencies.
- **Building**: Run `npm run build` from the root. This performs:
    - `clean:packages`: Removes `dist` folders from all packages.
    - `tsc -b`: Incremental build of all packages.
    - `postbuild`: Cleans `node_modules/@appweaver` and copies built packages there via `tools/copy-packages.js` to
      allow packages to reference each other during development.
- **Development Mode**: Run `npm run build:dev` to watch for changes and rebuild automatically.

#### 2. Testing

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

#### 3. Development Information

- **Code Style**:
    - **Formatting**: The project uses **Prettier**. Run `npm run format` to format the codebase.
    - **Linting**: The project uses **ESLint**. Run `npm run lint` to check for issues and `npm run lint -- --fix` to
      automatically fix what's possible.
- **Dependency Management**: Packages are linked locally in `node_modules/@appweaver` after the build. Ensure you run
  `npm run build` after making changes to shared packages if they are used by other packages or the sample application.

IMPORTANT: after a new feature is added or change is done in how the library is used, always update
./skill/SKILL.md file and any of the referenced files in ./skill/references/*.md.

#### 4. Architecture — Package Modules

##### `packages/common`

Shared utilities and base types used by all other packages. Contains foundational TypeScript interfaces, type
definitions, and helper utilities consumed by `packages/core` and `packages/cli`.

##### `packages/core`

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
npm run generate
# Full command: weaver generate --modelPattern ./**/model.ts \
#   --typesPath ./types/generated.ts \
#   --schemaPath ./prisma/schema.prisma \
#   --clientPath ./prisma/client
# Scans all model.ts files, emits typed interfaces + a Prisma schema, and
# places the generated Prisma client at ./prisma/client.

# Completely reset and recreate the development database
npm run db:recreate
# Full chain:
#   1. rimraf dev.db  (delete SQLite file)
#   2. rimraf prisma/migrations/*_init  (remove init migration)
#   3. weaver migration new init  (create fresh migration)
# Use whenever the schema has changed substantially and you want a clean slate.
```

##### `packages/cli`

The `weaver` CLI tool. Entry point: `weaver.ts` → compiled to `dist/weaver.js`.

See **Section 5** for the full command reference.

#### 5. CLI Command Reference (`weaver`)

All commands are available via `weaver <command>`.

---

##### `weaver build` (alias: `b`)

Build the application in the current project.

```
weaver build
```

1. Removes the `dist/` directory.
2. Runs `tsc -p tsconfig.build.json`.
3. Runs `tsc-alias` to resolve path aliases in emitted JS.

---

##### `weaver generate` (alias: `g`)

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

##### `weaver migrate` (alias: `mge`)

Apply pending database migrations (production / CI).

```
weaver migrate
```

Executes `prisma migrate deploy`.

---

##### `weaver migration` (alias: `mgn`)

Database migration commands for development.

###### `weaver migration new <name>`

Create a new database migration.

```
weaver migration new <name>
```

Executes `prisma migrate dev --name <name>`.

###### `weaver migration reset`

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

##### `weaver seed`

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

##### `weaver start` (alias: `s`)

Start the application.

```
weaver start [options]
```

| Option        | Description                                          |
|---------------|------------------------------------------------------|
| `-w, --watch` | Watch mode — recompiles and restarts on file changes |

- **Normal mode**: `node ./dist/src/main.js`
- **Watch mode**: `tsc-watch` with alias resolution and server restart on each successful build.

---

##### `weaver test setup`

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

##### `weaver test reset`

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

##### `weaver test teardown`

Remove the temporary test directory entirely.

```
weaver test teardown [options]
```

| Option                | Description         | Default  |
|-----------------------|---------------------|----------|
| `-d, --dir <tempDir>` | Temporary directory | `./temp` |
| `-v, --verbose`       | Verbose output      | false    |

---

#### 6. Sample Applications

##### `sample/cms-api`

A reference CMS (Content Management System) API that demonstrates how to build a complete application with Appweaver.
It includes user authentication, posts with file uploads, role-based authorization, scheduled jobs, custom routes, and
plugins.

###### Model definitions and code generation

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

###### Starting the application

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

###### Environment-based configuration

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

###### Seeding the database

Seeders live in `database/seeders/` and are executed in filename order:

```bash
weaver seed               # or: npm run seed
```

###### Testing

```bash
# Unit tests
npm run test

# End-to-end tests
npm run e2e
```

E2E tests use `weaver test setup` / `weaver test reset` / `weaver test teardown` to manage a temporary test database
and storage directory.

###### Docker

The included `Dockerfile` and `start.sh` support multiple entry points:

```bash
start.sh app          # Start the application server
start.sh migrations   # Apply database migrations
start.sh seed         # Seed the database
```

---

#### 7. Releasing New Versions

The project uses **semantic-release** with conventional commits to automate versioning, changelog generation, and npm
publishing.

##### Release workflow

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
6. **Package copy** (`@semantic-release/exec`) — runs `node ./tools/copy-packages.js` to sync built packages into
   `node_modules/@appweaver`.
7. **Publish** (`@semantic-release/exec`) — publishes each package's `dist/` directory to the GitLab npm registry:
    ```bash
    cd packages/core/dist    && npm publish
    cd packages/common/dist  && npm publish
    cd packages/cli/dist     && npm publish
    ```
8. **Git commit** (`@semantic-release/git`) — commits the updated `package.json` files and `CHANGELOG.md` with a chore
   commit, then tags the release.
9. **`postrelease`** — runs `git push --follow-tags` to push the commit and tag to the remote.

##### Registry

All packages are published to the GitLab npm registry:

```
https://gitlab.com/api/v4/projects/77748589/packages/npm/
```

Ensure your environment has a valid `NPM_TOKEN` (or `CI_JOB_TOKEN` in CI) with write access to this registry before
running a release.

##### Commit message conventions

`semantic-release` derives the version bump from commit prefixes:

| Prefix                                            | Version bump |
|---------------------------------------------------|--------------|
| `fix:`                                            | patch        |
| `feat:`                                           | minor        |
| `feat!:` / `BREAKING CHANGE` footer               | major        |
| `chore:`, `docs:`, `style:`, `refactor:`, `test:` | no release   |
