# CLI

All long flags are kebab-case. A flag that turns a default behavior off is a `--no-*` negation (`--no-registry`,
`--no-skill`), so leaving it out keeps the behavior on. `-v` is reserved for `--version`; `--verbose` has no short form.

## `weaver` — Top-level

```
weaver <command> [options]
```

| Option/Command  | Alias | Description                            |
|-----------------|-------|----------------------------------------|
| `build`         | `b`   | Build the application                  |
| `openapi`       | `oa`  | Generate OpenAPI specification schema  |
| `generate`      | `g`   | Generate types and/or schemas          |
| `migrate`       | `mge` | Run database migrations                |
| `migration`     | `mgn` | Database migration commands            |
| `seed`          | `sd`  | Seed the database                      |
| `start`         | `s`   | Start the application                  |
| `test`          | `t`   | Perform operations used during testing |
| `update`        | `u`   | Update the Appweaver packages          |
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
Missing output directories are created automatically.

---

## `weaver generate`

```
weaver generate|g [options]
```

Generate types and/or schemas. With no flags, generates both types and schema.

| Option                      | Description                             | Default                                  |
|-----------------------------|-----------------------------------------|------------------------------------------|
| `-t, --types`               | Generate TypeScript types               | —                                        |
| `-s, --schema`              | Generate Prisma schema                  | —                                        |
| `--model-pattern [pattern]` | Glob pattern for finding model files    | `config.RESOURCE_MODEL_PATTERN`          |
| `--types-path [path]`       | Output path for generated types         | `config.RESOURCE_GENERATED_TYPES_PATH`   |
| `--schema-path [path]`      | Output path for generated Prisma schema | `config.DATABASE_SCHEMA_PATH`            |
| `--client-path [path]`      | Output path for generated Prisma client | `config.DATABASE_CLIENT_OUTPUT_DIR_PATH` |
| `--no-registry`             | Skip registering the model types        | registered                               |
| `--verbose`                 | Print verbose output                    | `false`                                  |

Per model, the type file holds `<Model>`, `<Model>Single`, `<Model>Multiple`, `<Model>Create`, `<Model>Update`,
`<Model>RelationCreate`, `<Model>RelationUpdate`, `<Model>RelationInput`, `<Model>Query`, `<Model>Sort`,
`<Model>Aggregate`, and last `<Model>ResourceService`, the `injectService` type of that model. The file ends by
registering the types of every model in the `ResourceRegistry` of `@appweaver/common`, which lets the factories and
`injectService` infer them from a model name. `--no-registry` leaves the registration out.

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

Drops the database, recreates it, and re-applies every migration (`prisma migrate reset`). **All data is lost.**

| Option        | Description                                               | Default |
|---------------|-----------------------------------------------------------|---------|
| `-f, --force` | Allow the reset outside the `dev` and `test` environments | `false` |
| `-y, --yes`   | Skip confirmation prompt                                  | `false` |

Without `--force` the command runs only when `NODE_ENV` resolves to `dev` or `test`, and aborts otherwise. Either
`--force` or `--yes` skips the Prisma confirmation prompt.

---

## `weaver seed`

```
weaver seed|sd [options]
```

Seed the database.

| Option                    | Description                                                         | Default                            |
|---------------------------|---------------------------------------------------------------------|------------------------------------|
| `--seeders-path [path]`   | Seeders directory path                                              | `config.DATABASE_SEEDERS_DIR_PATH` |
| `-b, --build-project`     | Build the project before seeding                                    | `false`                            |
| `-p, --project [path]`    | TypeScript project build config file (used when `-b` is set)        | `tsconfig.build.json`              |
| `-c, --continue-on-error` | Continue seeder execution if error is thrown                        | `false`                            |
| `-f, --fix-warnings`      | Fix all seeder warnings like wrong checksum or deleted seeder files | `false`                            |

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

| Option                      | Description                             | Default                                  |
|-----------------------------|-----------------------------------------|------------------------------------------|
| `-d, --dir [tempDir]`       | Directory for temporary test data       | `./temp`                                 |
| `--model-pattern [pattern]` | Glob pattern for finding model files    | `config.RESOURCE_MODEL_PATTERN`          |
| `--schema-path [path]`      | Output path for generated Prisma schema | `config.DATABASE_SCHEMA_PATH`            |
| `--client-path [path]`      | Output path for generated Prisma client | `config.DATABASE_CLIENT_OUTPUT_DIR_PATH` |
| `--migration-name [name]`   | Name for the initial migration          | `init_test`                              |
| `--verbose`                 | Print verbose output                    | `false`                                  |

Aborts unless the storage, schema and client paths all resolve inside `--dir`, so a misconfigured test run cannot
touch the development database or uploads.

### `weaver test reset`

Requires `NODE_ENV=test`. With no flags, resets both database and storage.

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

## `weaver update`

```
weaver update|u [options] [packages...]
```

Update the Appweaver packages. The companion packages installed in the project are bumped along to the exact versions
the target release is built with, read from the `scaffoldDependencies` of `@appweaver/cli` in the registry. Missing
packages are never added and newer ones never downgraded. Run `weaver generate` afterward when Prisma is updated.

**Arguments:**

| Argument   | Description                                                                                                     | Default                               |
|------------|-----------------------------------------------------------------------------------------------------------------|---------------------------------------|
| `packages` | A list of packages to update (e.g. `@appweaver/core @appweaver/cli`). Only `@appweaver/*` packages are updated. | All installed `@appweaver/*` packages |

**Options:**

| Option                       | Description                                                                 | Default    |
|------------------------------|-----------------------------------------------------------------------------|------------|
| `--target-version [version]` | The version to update the packages to                                       | `"latest"` |
| `--no-skill`                 | Skip updating AI agents skill files in agent dirs (`.claude`, `.agents`, …) | updated    |
| `--no-companions`            | Skip updating the companion packages                                        | updated    |
| `--tooling`                  | Also update the tooling packages (`eslint`, `jest`, `prettier`, …)          | `false`    |
| `--dry-run`                  | Print the packages that would be updated without installing them            | `false`    |
| `-f, --force`                | Force update despite peerDependency version mismatches                      | `false`    |
| `--verbose`                  | Print verbose output                                                        | `false`    |
