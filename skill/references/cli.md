# CLI

All long flags are kebab-case, and an option taking a value requires it (`--types-path <path>`). A flag that turns a
default behavior off is a `--no-*` negation (`--no-registry`, `--no-skill`), so leaving it out keeps the behavior on.
The short flags have one meaning in every command: `-h` help, `-v` version, `-o` the output of a command, `-p` the
TypeScript project, `-w` watch, `-y` yes and `-f` force; every other flag has none. A path flag ends with `-path` for a
file and `-dir` for a directory (`--prisma-schema-path`, `--client-dir`).

The CLI needs only `@appweaver/core`. `generate`, `seed` and `test setup` load the `@appweaver/data` package of the
project when they run, and exit with `weaver <command> needs the @appweaver/data package` without it.

## `weaver` — Top-level

```
weaver <command> [options]
```

| Option/Command   | Alias | Description                                      |
|------------------|-------|--------------------------------------------------|
| `build`          | `b`   | Build the application                            |
| `config`         | `cfg` | Inspect the configuration                        |
| `openapi`        | `oa`  | Generate the OpenAPI specification               |
| `generate`       | `g`   | Generate the types and the schemas               |
| `migrate`        | `mge` | Apply the pending database migrations            |
| `migration`      | `mgn` | Create the migrations and reset the database     |
| `module`         | `mod` | Manage the modules of the project                |
| `run`            | `r`   | Run a one-shot task, or list the tasks           |
| `seed`           | `sd`  | Seed the database                                |
| `start`          | `s`   | Start the application                            |
| `test`           | `t`   | Set up, reset and tear down the test environment |
| `upgrade`        | `up`  | Upgrade the Appweaver packages                   |
| `help [command]` |       | Output usage information of a command            |
| `-v, --version`  |       | Output the current version                       |
| `-h, --help`     |       | Output usage information                         |

---

## `weaver build`

```
weaver build|b [options]
```

Build the application.

| Option                 | Description                    | Default               |
|------------------------|--------------------------------|-----------------------|
| `-p, --project <path>` | TypeScript project config file | `tsconfig.build.json` |
| `-h, --help`           | Output usage information       |                       |

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

| Option                     | Description                    | Default                   |
|----------------------------|--------------------------------|---------------------------|
| `-o, --output-path <path>` | Output path of the JSON Schema | `./appweaver.schema.json` |

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

Generate the OpenAPI specification of the application.

| Option                     | Description                                            | Default          |
|----------------------------|--------------------------------------------------------|------------------|
| `-o, --output-path <path>` | Output path of the OpenAPI specification               | `./openapi.json` |
| `--format <format>`        | Format of the OpenAPI specification (`json` or `yaml`) | `json`           |

When `--format yaml` is used and `--output-path` is left at its default, the output path becomes `./openapi.yaml`.
Missing output directories are created automatically. The command fails with a message when the `@appweaver/web`
module is not installed or disabled (`APP_MODULES_DISABLED`).

---

## `weaver generate`

```
weaver generate|g [options]
```

Generate the TypeScript types and the Prisma schema of the models, and the JSON Schema of `appweaver.json`. The flags
select the outputs; with none, it generates all three, the types and the Prisma schema only when `@appweaver/data` is
enabled.

| Option                        | Description                                        | Default                                         |
|-------------------------------|----------------------------------------------------|-------------------------------------------------|
| `--types`                     | Generate the TypeScript types                      | —                                               |
| `--prisma-schema`             | Generate the Prisma schema and client              | —                                               |
| `--config-schema`             | Generate the JSON Schema of `appweaver.json`       | —                                               |
| `--no-config-schema`          | Leave the config schema out of a run without flags | written                                         |
| `--model-pattern <pattern>`   | Glob pattern of the model files                    | from config (`RESOURCE_MODEL_PATTERN`)          |
| `--types-path <path>`         | Output path of the TypeScript types                | from config (`RESOURCE_GENERATED_TYPES_PATH`)   |
| `--prisma-schema-path <path>` | Output path of the Prisma schema                   | from config (`DATABASE_SCHEMA_PATH`)            |
| `--client-dir <dir>`          | Output directory of the Prisma client              | from config (`DATABASE_CLIENT_OUTPUT_DIR_PATH`) |
| `--config-schema-path <path>` | Output path of the JSON Schema of `appweaver.json` | `./appweaver.schema.json`                       |
| `--no-registry`               | Skip registering the model types                   | registered                                      |
| `--no-prune`                  | Keep the framework models not used                 | pruned                                          |
| `--verbose`                   | Print verbose output                               | `false`                                         |

Per model, the type file holds `<Model>`, `<Model>Single`, `<Model>Multiple`, `<Model>Create`, `<Model>Update`,
`<Model>RelationCreate`, `<Model>RelationUpdate`, `<Model>RelationInput`, `<Model>Query`, `<Model>Sort`,
`<Model>Aggregate`, `<Model>Series` (the values of its `series` fields, if any), and last `<Model>ResourceService`, the
`injectService` type of that model. The file ends by
registering the types of every model in the `ResourceRegistry` of `@appweaver/common`, which lets the factories and
`injectService` infer them from a model name. `--no-registry` leaves the registration out. Without any model the file
holds only `export {};`, so the `export * from './generated'` of the types index still compiles.

A model with `series` fields gets the `<Model>Series` table of its points in the Prisma schema (see
[timeseries](./timeseries.md)), left out when another store holds them: `timeseries.provider` set to `memory`, `none` or a
module path, or `auto` with a module package of another store enabled. `weaver test setup` follows the
provider of the `test` environment.

The models come from the project and from the `resources` of the enabled modules (see [modules](./modules.md)). The
framework models reach the schema only when the project uses them: `Role`, `Permission`, `ApiKey`, `OneTimeToken` and
`ConnectedAccount` with an auth model, `File` when a model declares `files`, and `Seeder` when the seeders directory
exists (or an enabled module declares `seeders`). `--no-prune` keeps all of them.

The registry belongs to the application: in a module package (`appweaver.module` in its `package.json`) `weaver
generate` never writes it, and in an application it leaves out, with a warning, the models of a module package whose
declaration files register them already, so no model is registered twice.

The config schema is `appweaver.schema.json`, the JSON Schema the `$schema` of `appweaver.json` points to, built from
the config sections the enabled modules list in their manifests, so rerun it after adding a module. `weaver generate
--config-schema` writes it without loading `@appweaver/data`, so it works in an application without a database too.

---

## `weaver migrate`

```
weaver migrate|mge [options]
```

Apply all pending database migrations (`prisma migrate deploy`). It creates no migration and never prompts, which
makes it the command to run in CI, in containers, and in production.

| Option      | Description                                                      | Default |
|-------------|------------------------------------------------------------------|---------|
| `--dry-run` | Print the pending migrations and their SQL without applying them | `false` |

`--dry-run` reads the pending migrations from `prisma migrate status` (Prisma has no dry run of `migrate deploy`) and
prints the `migration.sql` of each one, without changing the database. A status error, like a failed migration or an
unreachable database, is printed with the exit code of Prisma. Review what a deployment applies before running it:

```sh
NODE_ENV=prod weaver migrate --dry-run
```

---

## `weaver migration`

```
weaver migration|mgn [options] [command]
```

Create the database migrations and reset the database.

**Subcommands:**

| Command           | Description                                  |
|-------------------|----------------------------------------------|
| `new <name>`      | Create a new database migration and apply it |
| `reset [options]` | Reset the database                           |

### `weaver migration reset`

Drops the database, recreates it, and re-applies every migration (`prisma migrate reset`). **All data is lost.** Prisma
refuses the reset for an AI agent when `DATABASE_AI_DANGEROUS_ACTIONS_ENABLED` is `false`, like the `prisma migrate dev`
of `weaver migration new` and `weaver test setup`, see **Run tests** in [SKILL.md](../SKILL.md).

| Option        | Description                                               | Default |
|---------------|-----------------------------------------------------------|---------|
| `-y, --yes`   | Skip the confirmation prompt                              | `false` |
| `-f, --force` | Allow the reset outside the `dev` and `test` environments | `false` |

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
the English texts. The dependencies are installed when `package.json` changed. `--database` picks the database of
the `data` module (`weaver module add data --database postgresql`), SQLite by default; it is refused once `data` is
enabled, and reported as ignored when `data` is not added.

A name that is not a scaffold module, with a scope, a `-` or a `/`, is a module package
(`weaver module add @acme/appweaver-gcs`), installed with
`npm install --ignore-scripts <package>` (`bun add` on Bun), so its install scripts never run. The command then
prints the providers of its manifest, selected in the provider key of their contract, and the modules it requires, or
that the package is not a module (no `appweaver.module` field in its `package.json`, or no valid manifest). With
`--dry-run` it prints the install command instead.

| Option              | Description                                      | Default   |
|---------------------|--------------------------------------------------|-----------|
| `--database <type>` | `sqlite`, `postgresql`, `mysql` or `sqlserver`   | `sqlite`  |
| `--no-install`      | Skip the installation of the dependencies        | installed |
| `--dry-run`         | Print the changes without applying them          | `false`   |
| `-f, --force`       | Overwrite the existing files instead of skipping | `false`   |
| `--verbose`         | Print verbose output                             | `false`   |

### `weaver module remove`

```
weaver module remove|rm <modules...> [options]
```

Remove the modules: their packages, their `appweaver.json` values (the ones changed in the project are kept), their
files (the whole `templates/`, `locales/` and `database/` directories, the Docker files), and what they added to the
other enabled modules. Removing `locales` writes the English texts of `locales/en.json` into the templates first.
Removing `mailer` deletes the `emails` texts of `locales/en.json` that still hold their scaffolded value. A module that
an enabled module requires is removed only along with it. In `src/` and `database/seeders/` only the unchanged files
of `web` are deleted (the `User` resource and its admin seeder), the changed ones are kept with a warning, and so is a
changed e2e test of `web`. Removing `data` deletes `database/` with its migrations and seeders, listing the ones written
in the project in a warning.

| Option         | Description                               | Default   |
|----------------|-------------------------------------------|-----------|
| `--no-install` | Skip the installation of the dependencies | installed |
| `--dry-run`    | Print the changes without applying them   | `false`   |
| `--verbose`    | Print verbose output                      | `false`   |

---

## `weaver run`

```
weaver run|r
weaver run|r <task> [args...]
```

Run a one-shot task with the application by its name or its file, or list the tasks without one. The server, the
health listener and the scheduled jobs never start (`SERVER_LISTEN`, `HEALTH_CHECK_PORT` and `SCHEDULER_AUTO_START_JOB`
are forced off), and the command exits with the number the task returns (`0` otherwise, `1` when it throws). Invalid
arguments and `--help` exit before the application starts.

A task is the default export of a file in `src/tasks/` (`APP_TASKS_DIR_PATH`), created with `createTask`. Only `run`
is required, and the values of the arguments and options are typed from their declarations:

```ts
// src/tasks/orders/count.ts, run with `weaver run orders:count Paid --min 2`
import { createTask, injectService } from '@appweaver/core';

export default createTask({
  description: 'Counts the orders of a status.', // listed by `weaver run`
  arguments: {
    status: { required: true, choices: ['Pending', 'Paid'] } // <status>: 'Pending' | 'Paid'
  },
  options: {
    min: { type: 'number', default: 1 },                     // --min <min>: number
    quiet: { type: 'boolean', description: 'Print nothing.' } // --quiet: boolean
  },
  run: async ({ args, options }) => {
    const count = await injectService('Order').count({ status: args.status });
    if (!options.quiet) {
      console.log(`${count} orders`);
    }
    return count >= options.min ? 0 : 1; // the exit code
  }
});
```

| Field         | Description                                                                                                                   |
|---------------|-------------------------------------------------------------------------------------------------------------------------------|
| `run`         | `({ args, options, argv }) => number \| void`, `argv` holding the arguments as given                                          |
| `name`        | Default: the path in the tasks directory (`orders/count.ts` is `orders:count`)                                                |
| `description` | Listed by `weaver run`, shown by `--help`                                                                                     |
| `arguments`   | Filled in the order of their keys: `description`, `type` (`string`, `number`), `required`, `variadic`, `default`, `choices`   |
| `options`     | A camelCase key is a kebab-case flag: `description`, `type` (`string`, `number`, `boolean`), `required`, `default`, `choices` |

The required arguments come before the optional ones and have no `default`, only the last one is `variadic`, and no
key is an integer, otherwise the task fails to run. A task declaring no `arguments` or `options` takes any, read from
`argv`.

```sh
weaver run                                 # list the tasks with their descriptions
weaver run orders:count --help             # the usage of a task
weaver run orders:count Pending --quiet    # run a task by its name
weaver run src/tasks/orders/count.ts Paid  # run the task of a file
```

The tasks of the enabled modules are listed and run too (see [modules](./modules.md)), a task of the application
replacing a module task of the same name. A plain default function, `(args: string[]) => number | void`, still works,
receiving the raw arguments. On Node the tasks run from the build output (`dist/src/tasks/`), so build first.

---

## `weaver seed`

```
weaver seed|sd [options]
```

Seed the database.

| Option                 | Description                                                             | Default                                   |
|------------------------|-------------------------------------------------------------------------|-------------------------------------------|
| `--build-project`      | Build the project before seeding                                        | `false`                                   |
| `-p, --project <path>` | TypeScript project config file of `--build-project`                     | `tsconfig.build.json`                     |
| `--seeders-dir <dir>`  | Directory of the seeders                                                | from config (`DATABASE_SEEDERS_DIR_PATH`) |
| `--continue-on-error`  | Continue running the seeders when one throws an error                   | `false`                                   |
| `--fix-warnings`       | Fix the seeder warnings, like a wrong checksum or a deleted seeder file | `false`                                   |
| `--dry-run`            | Print the pending seeders and the warnings to fix without running them  | `false`                                   |

The seeders of the enabled modules (their `seeders` directory) run first, each recorded under its module name
(`billing/1-plans`), then the seeders of the application. A missing seeders directory is skipped with a warning, and
its recorded seeders are not reported as deleted; the command fails only when no directory is accessible.

With `--dry-run`, the pending seeders are listed but not run, and nothing is written: the warnings are still reported,
and the `--fix-warnings` fixes printed instead of applied. It reads the seeders table, so the database must be
migrated.

---

## `weaver start`

```
weaver start|s [options]
```

Start the application.

| Option                 | Description                                                 | Default               |
|------------------------|-------------------------------------------------------------|-----------------------|
| `-w, --watch`          | Run in watch mode (recompiles and restarts on file changes) | `false`               |
| `-p, --project <path>` | TypeScript project config file of the watch mode            | `tsconfig.build.json` |

In watch mode the server also restarts when a file of the template or translation directories (`TEMPLATE_PATH`,
`LOCALE_PATH`) changes, the Node runtime only while the last build succeeded.

---

## `weaver test`

```
weaver test|t [options] [command]
```

Set up, reset and tear down the test environment.

**Subcommands:**

| Command              | Description                                                                               |
|----------------------|-------------------------------------------------------------------------------------------|
| `setup [options]`    | Set up the temporary test data: the storage directory, the Prisma schema and the database |
| `reset [options]`    | Reset the test database and/or the storage files                                          |
| `teardown [options]` | Remove the temporary test directory                                                       |

### `weaver test setup`

Requires `NODE_ENV=test`.

| Option                        | Description                           | Default                                         |
|-------------------------------|---------------------------------------|-------------------------------------------------|
| `--temp-dir <dir>`            | Directory of the temporary test data  | `./temp`                                        |
| `--model-pattern <pattern>`   | Glob pattern of the model files       | from config (`RESOURCE_MODEL_PATTERN`)          |
| `--prisma-schema-path <path>` | Output path of the Prisma schema      | from config (`DATABASE_SCHEMA_PATH`)            |
| `--client-dir <dir>`          | Output directory of the Prisma client | from config (`DATABASE_CLIENT_OUTPUT_DIR_PATH`) |
| `--migration-name <name>`     | Name of the initial migration         | `init_test`                                     |
| `--verbose`                   | Print verbose output                  | `false`                                         |

Aborts unless the storage, schema and client paths all resolve inside `--temp-dir`, so a misconfigured test run cannot
touch the development database or uploads. It resets the test database (`prisma migrate reset --force`) before the
initial migration, since a PostgreSQL or MySQL test database keeps the tables and migrations of the last run.

### `weaver test reset`

Requires `NODE_ENV=test`. With no flags, resets both database and storage. The database is reset with
`prisma migrate reset`, which Prisma refuses to run for an AI agent when `DATABASE_AI_DANGEROUS_ACTIONS_ENABLED` is
`false`, see **Run tests** in [SKILL.md](../SKILL.md). An agent never changes it itself.

| Option             | Description                          | Default  |
|--------------------|--------------------------------------|----------|
| `--database`       | Reset the database                   | —        |
| `--storage`        | Reset the storage files              | —        |
| `--temp-dir <dir>` | Directory of the temporary test data | `./temp` |
| `--verbose`        | Print verbose output                 | `false`  |

### `weaver test teardown`

Requires `NODE_ENV=test`.

| Option             | Description                          | Default  |
|--------------------|--------------------------------------|----------|
| `--temp-dir <dir>` | Directory of the temporary test data | `./temp` |
| `--verbose`        | Print verbose output                 | `false`  |

The test database of a server (PostgreSQL, MySQL, SQL Server) is kept, since `weaver test setup` resets it.

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

| Argument   | Description                                                                    | Default                               |
|------------|--------------------------------------------------------------------------------|---------------------------------------|
| `packages` | The `@appweaver/*` packages to upgrade (i.e. `@appweaver/core @appweaver/cli`) | All installed `@appweaver/*` packages |

**Options:**

| Option                       | Description                                                                     | Default  |
|------------------------------|---------------------------------------------------------------------------------|----------|
| `--no-companions`            | Skip upgrading the companion packages                                           | upgraded |
| `--tooling`                  | Also upgrade the tooling packages (`eslint`, `jest`, `prettier`, …)             | `false`  |
| `--no-skill`                 | Skip upgrading the AI agent skill files in agent dirs (`.claude`, `.agents`, …) | upgraded |
| `--target-version <version>` | Version to upgrade the packages to                                              | `latest` |
| `--dry-run`                  | Print the packages that would be upgraded without installing them               | `false`  |
| `-f, --force`                | Upgrade despite the peerDependency version mismatches                           | `false`  |
| `--verbose`                  | Print verbose output                                                            | `false`  |
