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
- **Running specific tests**: `npx jest path/to/test.spec.ts`
- **Adding new tests**:
    - Create a file with `.spec.ts` or `.test.ts` extension in the `test` directory of the relevant package.
    - Follow the standard `describe`/`test`/`expect` pattern.

**Example Test Case**:

```typescript
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

#### 4. Architecture — Package Modules

##### `packages/common`

Shared utilities and base types used by all other packages. Contains foundational TypeScript interfaces, type
definitions, and helper utilities consumed by `packages/core` and `packages/cli`.

##### `packages/core`

Core application logic. Organized into the following modules:

| Module       | Purpose                                                                                                                                                   |
|--------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------|
| `app/`       | Application lifecycle: bootstrapping, loading modules and providers, startup/shutdown hooks                                                               |
| `database/`  | Database client factory and Prisma setup (`create-client.ts`, `prisma-database.ts`)                                                                       |
| `server/`    | Fastify HTTP server creation, route registration, model mounting, Swagger/OpenAPI integration                                                             |
| `security/`  | Authentication and authorization — sub-modules for JWT, OAuth2, API key, basic auth, reCAPTCHA, account management, and security token storage (`store/`) |
| `resource/`  | CRUD resource lifecycle: loading, routing, schema validation, and service layer                                                                           |
| `factory/`   | Factory helpers for creating models, policies, routes, and services                                                                                       |
| `storage/`   | File upload and management — filesystem storage and file service/routes                                                                                   |
| `queue/`     | Background job queues — Bull (Redis-backed) and in-memory implementations                                                                                 |
| `scheduler/` | Cron job scheduling (`cron-scheduler.ts`)                                                                                                                 |
| `seeder/`    | Database seeding utilities (`create-seeder.ts`, `seeder.ts`)                                                                                              |
| `mailer/`    | Email service — SMTP and JSON (dev/test) mailer implementations                                                                                           |
| `cache/`     | Caching layer abstractions and implementations                                                                                                            |
| `context/`   | Dependency injection container                                                                                                                            |
| `health/`    | Health check endpoint registration                                                                                                                        |
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
#   3. prisma migrate dev --name init  (create fresh migration)
#   4. prisma generate  (regenerate Prisma client)
# Use whenever the schema has changed substantially and you want a clean slate.

# Apply pending migrations without creating new ones (CI / production)
npm run db:migrate   # prisma migrate deploy

# Regenerate the Prisma client after manual schema edits
npm run db:generate  # prisma generate

# Delete dev.db and the init migration only (no recreation)
npm run db:remove
```

##### `packages/cli`

The `weaver` CLI tool. Entry point: `weaver.ts` → compiled to `dist/weaver.js`.

See **Section 5** for the full command reference.

#### 5. CLI Command Reference (`weaver`)

All commands are available via `npx weaver <command>` or the local `npm run weaver --` alias inside `packages/core`.

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

Create a new database migration during development.

```
weaver migration -n <NAME>
```

| Option              | Description            | Required |
|---------------------|------------------------|----------|
| `-n, --name <NAME>` | Name for the migration | Yes      |

Executes `prisma migrate dev --name <NAME>`.

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

#### 6. Releasing New Versions

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
