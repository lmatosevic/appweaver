# CLI

All long flags are kebab-case. A flag that turns a default behavior off is a `--no-*` negation (`--no-registry`,
`--no-skill`), so leaving it out keeps the behavior on. `-v` is reserved for `--version`; `--verbose` has no short form.

The CLI needs only `@appweaver/core`. `generate`, `seed` and `test setup` load the `@appweaver/data` package of the
project when they run, and exit with `weaver <command> needs the @appweaver/data package` without it.

## `weaver` — Top-level

```
weaver <command> [options]
```

| Option/Command  | Alias | Description                            |
|-----------------|-------|----------------------------------------|
| `build`         | `b`   | Build the application                  |
| `config`        | `cfg` | Inspect the configuration              |
| `openapi`       | `oa`  | Generate OpenAPI specification schema  |
| `generate`      | `g`   | Generate types and/or schemas          |
| `migrate`       | `mge` | Run database migrations                |
| `migration`     | `mgn` | Database migration commands            |
| `module`        | `mod` | Manage the modules of the project      |
| `run`           | `r`   | Run a one-shot task file               |
| `seed`          | `sd`  | Seed the database                      |
| `start`         | `s`   | Start the application                  |
| `test`          | `t`   | Perform operations used during testing |
| `upgrade`       | `up`  | Upgrade the Appweaver packages         |
| `help`          |       | Display help for command               |
| `-v, --version` |       | Output the current version             |
| `-h, --help`    |       | Output usage information               |

---

## `weaver build`

```
weaver build|b [options]
```

Build the application.

| Option                 | Description                          | Default               |
|------------------------|--------------------------------------|-----------------------|
| `-p, --project [path]` | TypeScript project build config file | `tsconfig.build.json` |
| `-h, --help`           | Output usage information             |                       |

---

## `weaver config`

```
weaver config|cfg <command> [options]
```

Inspect the configuration of the application. Each subcommand creates the application without starting it, so the
config sections of the enabled modules (the installed packages and `src/modules/*`) and of the application files are
all defined.

| Command            | Description                                                          |
|--------------------|----------------------------------------------------------------------|
| `schema [options]` | Generate the JSON Schema of `appweaver.json`                         |
| `print`            | Print every config value with its source, the secrets hidden         |
| `check`            | Validate the config of every enabled module, exit with 1 on an error |

### `weaver config schema`

| Option                     | Description                          | Default                   |
|----------------------------|--------------------------------------|---------------------------|
| `-o, --output-path [path]` | Output path for the generated schema | `./appweaver.schema.json` |

Writes the JSON Schema of `appweaver.json`, built from the config sections of the enabled modules: every key under its
camelCase name in the nested object of its section, with its type and default, for `config` and each
`environments.<env>`. The `$schema` of `appweaver.json` points to it (`"$schema": "./appweaver.schema.json"`), for the
completion and validation of the module packages' sections too. `weaver generate` writes the same file from the
sections the modules list, while this command creates the application, so it also finds a section defined in an
application file outside a module.

### `weaver config print`

Prints the environment, then every flattened key sorted by name, with its source and value:

```
Environment: dev

SECURITY_JWT_SECRET  env       "********"
SERVER_PORT          json      5000
STORAGE_PROVIDER     default   "auto"
```

The source is `override` (`configOverrides` of a test), `env` (the environment and the `.env` files), `json` (the
`appweaver*.json` files) or `default` (the schema default), the one `configSource(key)` of `@appweaver/common` returns.
A value is hidden when its key ends with `PASSWORD`, `SECRET`, `TOKEN`, `PRIVATE_KEY`, `CREDENTIALS` or `API_KEY`, or
its schema has the `secret: true` option. The errors of the invalid sections are printed after the table, with exit
code 1.

### `weaver config check`

Parses every section and exits with 1, listing the errors, when a value is missing or invalid. An error names only the
invalid keys, each with its environment variable and JSON path. Run it in CI with the deployed environment, so a bad
value fails the pipeline instead of the startup:

```sh
NODE_ENV=prod weaver config check
```

---

## `weaver openapi`

```
weaver openapi|oa [options]
```

Generate application OpenAPI specification schema.

| Option                     | Description                                                      | Default          |
|----------------------------|------------------------------------------------------------------|------------------|
| `-o, --output-path [path]` | Output path for generated OpenAPI specification                  | `./openapi.json` |
| `-f, --format [format]`    | Output format for generated OpenAPI specification (json or yaml) | `json`           |

When `--format yaml` is used and `--output-path` is left at its default, the output path becomes `./openapi.yaml`.
Missing output directories are created automatically. The command fails with a message when the `@appweaver/web`
module is not installed or disabled (`APP_MODULES_DISABLED`).

---

## `weaver generate`

```
weaver generate|g [options]
```

Generate types and/or schemas. With no flags, generates both types and schema.

| Option                        | Description                                         | Default                                         |
|-------------------------------|-----------------------------------------------------|-------------------------------------------------|
| `-t, --types`                 | Generate TypeScript types                           | —                                               |
| `-s, --schema`                | Generate Prisma schema                              | —                                               |
| `--model-pattern [pattern]`   | Glob pattern for finding model files                | from config (`RESOURCE_MODEL_PATTERN`)          |
| `--types-path [path]`         | Output path for generated types                     | from config (`RESOURCE_GENERATED_TYPES_PATH`)   |
| `--schema-path [path]`        | Output path for generated Prisma schema             | from config (`DATABASE_SCHEMA_PATH`)            |
| `--client-path [path]`        | Output path for generated Prisma client             | from config (`DATABASE_CLIENT_OUTPUT_DIR_PATH`) |
| `--no-registry`               | Skip registering the model types                    | registered                                      |
| `--no-prune`                  | Keep the framework models not used                  | pruned                                          |
| `--config-schema-path [path]` | Output path for the JSON Schema of `appweaver.json` | `./appweaver.schema.json`                       |
| `--no-config-schema`          | Skip writing the JSON Schema of `appweaver.json`    | written                                         |
| `--verbose`                   | Print verbose output                                | `false`                                         |

Per model, the type file holds `<Model>`, `<Model>Single`, `<Model>Multiple`, `<Model>Create`, `<Model>Update`,
`<Model>RelationCreate`, `<Model>RelationUpdate`, `<Model>RelationInput`, `<Model>Query`, `<Model>Sort`,
`<Model>Aggregate`, and last `<Model>ResourceService`, the `injectService` type of that model. The file ends by
registering the types of every model in the `ResourceRegistry` of `@appweaver/common`, which lets the factories and
`injectService` infer them from a model name. `--no-registry` leaves the registration out. Without any model the file
holds only `export {};`, so the `export * from './generated'` of the types index still compiles.

The models come from the project and from the `resources` of the enabled modules (see [modules](./modules.md)). The
framework models reach the schema only when the project uses them: `Role`, `Permission`, `ApiKey`, `OneTimeToken` and
`ConnectedAccount` with an auth model, `File` when a model declares `files`, and `Seeder` when the seeders directory
exists (or an enabled module declares `seeders`). `--no-prune` keeps all of them.

The registry belongs to the application: in a module package (`appweaver.module` in its `package.json`) `weaver
generate` never writes it, and in an application it leaves out, with a warning, the models of a module package whose
declaration files register them already, so no model is registered twice.

With the types, `weaver generate` writes `appweaver.schema.json`, the JSON Schema the `$schema` of `appweaver.json`
points to, from the config sections the enabled modules list in their manifests, so rerun it after adding a module.

---

## `weaver migrate`

```
weaver migrate|mge
```

Apply all pending database migrations (`prisma migrate deploy`). Takes no options, creates nothing, and never
prompts, which makes it the command to run in CI, in containers, and in production.

---

## `weaver migration`

```
weaver migration|mgn [options] [command]
```

Database migration commands.

**Subcommands:**

| Command           | Description                     |
|-------------------|---------------------------------|
| `new <name>`      | Create a new database migration |
| `reset [options]` | Reset the database              |

### `weaver migration reset`

Drops the database, recreates it, and re-applies every migration (`prisma migrate reset`). **All data is lost.** Prisma
refuses the reset for an AI agent when `DATABASE_AI_DANGEROUS_ACTIONS_ENABLED` is `false`, like the `prisma migrate dev`
of `weaver migration new` and `weaver test setup`, see **Run tests** in [SKILL.md](../SKILL.md).

| Option        | Description                                               | Default |
|---------------|-----------------------------------------------------------|---------|
| `-f, --force` | Allow the reset outside the `dev` and `test` environments | `false` |
| `-y, --yes`   | Skip confirmation prompt                                  | `false` |

Without `--force` the command runs only when `NODE_ENV` resolves to `dev` or `test`, and aborts otherwise. Either
`--force` or `--yes` skips the Prisma confirmation prompt.

---

## `weaver module`

```
weaver module|mod <command> [options]
```

Add and remove the optional modules of `@appweaver/create` in an existing project, from the templates of the
installed `@appweaver/cli`, install module packages, and create local modules. A module is enabled when the project
depends on its packages, `locales` and `docker` when `locales/` and `Dockerfile` exist.

| Module      | Packages                | Requires | Files                                                                                                                              |
|-------------|-------------------------|----------|------------------------------------------------------------------------------------------------------------------------------------|
| `redis`     | `@appweaver/redis`      | —        | The Redis service of `docker-compose.yml`                                                                                          |
| `queue`     | `@appweaver/bullmq`     | `redis`  | —                                                                                                                                  |
| `scheduler` | `@appweaver/cron`       | —        | —                                                                                                                                  |
| `mailer`    | `@appweaver/nodemailer` | —        | The email templates of `templates/` (`emails/`, `layouts/email`, `partials/email-button`), the `emails` texts of `locales/en.json` |
| `templates` | `@appweaver/handlebars` | —        | `templates/`, the Dockerfile `COPY` of the templates                                                                               |
| `locales`   | —                       | —        | `locales/en.json` (empty without the mailer), the Dockerfile `COPY` of the translation files                                       |
| `docker`    | —                       | —        | `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `start.sh`, `database/mariadb-init.sh` (MySQL)                                |

### `weaver module list`

```
weaver module list|ls
```

List the modules, whether the project has them enabled, their packages, requirements and description.

### `weaver module new`

```
weaver module new <name> [--dry-run]
```

Create a local module in `src/modules/<name>/` (under `APP_SOURCE_PATH`), enabled by `APP_MODULES_PATTERN` without any
config:

| File        | Holds                                                                                                |
|-------------|------------------------------------------------------------------------------------------------------|
| `module.ts` | The manifest: its name, config, `loggers` and `main`, with commented `providers` and `services`      |
| `config.ts` | Its config section, named after the camelCase of the name (`audit-log` → `auditLog`), with `ENABLED` |
| `main.ts`   | The code run at startup: scheduled jobs, queue workers, event listeners                              |

The name must be kebab-case (`billing`, `audit-log`). The command fails, writing nothing, when a file of the module
exists. `--dry-run` prints the files without writing them.

### `weaver module add`

```
weaver module add <modules...> [options]
```

Add the modules, with the modules they require: their packages to `package.json` (at the versions of the release),
their values to `appweaver.json`, their files, and what they add to the other enabled modules. An existing file that
differs is skipped and reported. Adding `locales` restores the `t` calls of the scaffolded templates still holding
the English texts. The dependencies are installed when `package.json` changed.

A name that is not a scaffold module, with a scope, a `-` or a `/`, is a module package
(`weaver module add @acme/appweaver-gcs`), installed with
`npm install --ignore-scripts <package>` (`bun add` on Bun), so its install scripts never run. The command then
prints the providers of its manifest, selected in the provider key of their contract, and the modules it requires, or
that the package is not a module (no `appweaver.module` field in its `package.json`, or no valid manifest). With
`--dry-run` it prints the install command instead.

| Option         | Description                                      | Default   |
|----------------|--------------------------------------------------|-----------|
| `-f, --force`  | Overwrite the existing files instead of skipping | `false`   |
| `--dry-run`    | Print the changes without applying them          | `false`   |
| `--no-install` | Skip the installation of the dependencies        | installed |
| `--verbose`    | Print verbose output                             | `false`   |

### `weaver module remove`

```
weaver module remove|rm <modules...> [options]
```

Remove the modules: their packages, their `appweaver.json` values (the ones changed in the project are kept), their
files (the whole `templates/` and `locales/` directories, the Docker files), and what they added to the other enabled
modules. Removing `locales` writes the English texts of `locales/en.json` into the templates first. Removing `mailer`
deletes
the `emails` texts of `locales/en.json` that still hold their scaffolded value. A module that an
enabled module requires is removed only along with it. The `src/` code is never touched.

| Option         | Description                               | Default   |
|----------------|-------------------------------------------|-----------|
| `--dry-run`    | Print the changes without applying them   | `false`   |
| `--no-install` | Skip the installation of the dependencies | installed |
| `--verbose`    | Print verbose output                      | `false`   |

---

## `weaver run`

```
weaver run|r <file> [args...]
```

Run a one-shot task with the application, like a Rails runner. The command creates the application without starting
the server listening, the health listener or the scheduled jobs (`SERVER_LISTEN`, `HEALTH_CHECK_PORT` and
`SCHEDULER_AUTO_START_JOB` are forced off), calls the default export of the file
with the arguments given after it, stops the application, and exits with the number the task returns (`0` otherwise,
`1` when it throws). On Node a `.ts` path runs from the build output (`src/tasks/report.ts` from
`dist/src/tasks/report.js`), so build first; Bun runs the source.

```ts
// src/tasks/report.ts
export default async function (args: string[]): Promise<number | void> {
  // the full application context is available: inject, injectService, ...
}
```

```sh
weaver run src/tasks/report.ts 2026-10
```

---

## `weaver seed`

```
weaver seed|sd [options]
```

Seed the database.

| Option                    | Description                                                         | Default                                   |
|---------------------------|---------------------------------------------------------------------|-------------------------------------------|
| `--seeders-path [path]`   | Seeders directory path                                              | from config (`DATABASE_SEEDERS_DIR_PATH`) |
| `-b, --build-project`     | Build the project before seeding                                    | `false`                                   |
| `-p, --project [path]`    | TypeScript project build config file (used when `-b` is set)        | `tsconfig.build.json`                     |
| `-c, --continue-on-error` | Continue seeder execution if error is thrown                        | `false`                                   |
| `-f, --fix-warnings`      | Fix all seeder warnings like wrong checksum or deleted seeder files | `false`                                   |

The seeders of the enabled modules (their `seeders` directory) run first, each recorded under its module name
(`billing/1-plans`), then the seeders of the application. A missing seeders directory is skipped with a warning, and
its recorded seeders are not reported as deleted; the command fails only when no directory is accessible.

---

## `weaver start`

```
weaver start|s [options]
```

Start the application.

| Option                 | Description                                                 | Default               |
|------------------------|-------------------------------------------------------------|-----------------------|
| `-p, --project [path]` | TypeScript project config file                              | `tsconfig.build.json` |
| `-w, --watch`          | Run in watch mode (recompiles and restarts on file changes) | `false`               |

In watch mode the server also restarts when a file of the template or translation directories (`TEMPLATE_PATH`,
`LOCALE_PATH`) changes, the Node runtime only while the last build succeeded.

---

## `weaver test`

```
weaver test|t [options] [command]
```

Perform operations used during testing.

**Subcommands:**

| Command              | Description                                                |
|----------------------|------------------------------------------------------------|
| `setup [options]`    | Setup temporary test data (database schema and migrations) |
| `reset [options]`    | Reset database and/or file storage in temporary directory  |
| `teardown [options]` | Remove temporary test directory                            |

### `weaver test setup`

Requires `NODE_ENV=test`.

| Option                      | Description                             | Default                                         |
|-----------------------------|-----------------------------------------|-------------------------------------------------|
| `-d, --dir [tempDir]`       | Directory for temporary test data       | `./temp`                                        |
| `--model-pattern [pattern]` | Glob pattern for finding model files    | from config (`RESOURCE_MODEL_PATTERN`)          |
| `--schema-path [path]`      | Output path for generated Prisma schema | from config (`DATABASE_SCHEMA_PATH`)            |
| `--client-path [path]`      | Output path for generated Prisma client | from config (`DATABASE_CLIENT_OUTPUT_DIR_PATH`) |
| `--migration-name [name]`   | Name for the initial migration          | `init_test`                                     |
| `--verbose`                 | Print verbose output                    | `false`                                         |

Aborts unless the storage, schema and client paths all resolve inside `--dir`, so a misconfigured test run cannot
touch the development database or uploads. It resets the test database (`prisma migrate reset --force`) before the
initial migration, since a PostgreSQL or MySQL test database keeps the tables and migrations of the last run.

### `weaver test reset`

Requires `NODE_ENV=test`. With no flags, resets both database and storage. The database is reset with
`prisma migrate reset`, which Prisma refuses to run for an AI agent when `DATABASE_AI_DANGEROUS_ACTIONS_ENABLED` is
`false`, see **Run tests** in [SKILL.md](../SKILL.md). An agent never changes it itself.

| Option                | Description                       | Default  |
|-----------------------|-----------------------------------|----------|
| `-d, --dir [tempDir]` | Directory for temporary test data | `./temp` |
| `--database`          | Reset database                    | —        |
| `--storage`           | Reset file storage                | —        |
| `--verbose`           | Print verbose output              | `false`  |

### `weaver test teardown`

Requires `NODE_ENV=test`.

| Option                | Description                       | Default  |
|-----------------------|-----------------------------------|----------|
| `-d, --dir [tempDir]` | Directory for temporary test data | `./temp` |
| `--verbose`           | Print verbose output              | `false`  |

---

## `weaver upgrade`

```
weaver upgrade|up [options] [packages...]
```

Upgrade the Appweaver packages. The companion packages installed in the project (Prisma and its adapters, TypeBox,
TypeScript) are bumped along to the exact versions the target release is built with, read from the
`scaffoldDependencies` of `@appweaver/cli` in the registry. The libraries of the drivers come with their `@appweaver/*`
packages. Missing packages are never added and newer ones never downgraded. Run `weaver generate` afterward when Prisma
is upgraded.

**Arguments:**

| Argument   | Description                                                                                                       | Default                               |
|------------|-------------------------------------------------------------------------------------------------------------------|---------------------------------------|
| `packages` | A list of packages to upgrade (e.g. `@appweaver/core @appweaver/cli`). Only `@appweaver/*` packages are upgraded. | All installed `@appweaver/*` packages |

**Options:**

| Option                       | Description                                                                  | Default    |
|------------------------------|------------------------------------------------------------------------------|------------|
| `--target-version [version]` | The version to upgrade the packages to                                       | `"latest"` |
| `--no-skill`                 | Skip upgrading AI agents skill files in agent dirs (`.claude`, `.agents`, …) | upgraded   |
| `--no-companions`            | Skip upgrading the companion packages                                        | upgraded   |
| `--tooling`                  | Also upgrade the tooling packages (`eslint`, `jest`, `prettier`, …)          | `false`    |
| `--dry-run`                  | Print the packages that would be upgraded without installing them            | `false`    |
| `-f, --force`                | Force upgrade despite peerDependency version mismatches                      | `false`    |
| `--verbose`                  | Print verbose output                                                         | `false`    |
