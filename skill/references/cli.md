# CLI

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

| Option          | Description                          | Default               |
|-----------------|--------------------------------------|-----------------------|
| `-p, --project` | TypeScript project build config file | `tsconfig.build.json` |
| `-h, --help`    | Output usage information             |                       |

---

## `weaver openapi`

```
weaver openapi|oa [options]
```

Generate application OpenAPI specification schema.

| Option                    | Description                                                      | Default         |
|---------------------------|------------------------------------------------------------------|-----------------|
| `-o, --outputPath [path]` | Output path for generated OpenAPI specification                  | `./schema.json` |
| `-f, --format [format]`   | Output format for generated OpenAPI specification (json or yaml) | `json`          |

---

## `weaver generate`

```
weaver generate|g [options]
```

Generate types and/or schemas. With no flags, generates both types and schema.

| Option                     | Description                             | Default                                  |
|----------------------------|-----------------------------------------|------------------------------------------|
| `-t, --types`              | Generate TypeScript types               | —                                        |
| `-s, --schema`             | Generate Prisma schema                  | —                                        |
| `--modelPattern [pattern]` | Glob pattern for finding model files    | `config.RESOURCE_MODEL_PATTERN`          |
| `--typesPath [path]`       | Output path for generated types         | `config.RESOURCE_GENERATED_TYPES_PATH`   |
| `--schemaPath [path]`      | Output path for generated Prisma schema | `config.DATABASE_SCHEMA_PATH`            |
| `--clientPath [path]`      | Output path for generated Prisma client | `config.DATABASE_CLIENT_OUTPUT_DIR_PATH` |
| `--verbose`                | Print verbose output                    | `false`                                  |

---

## `weaver migrate`

```
weaver migrate|mge [options]
```

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

| Option        | Description                                  | Default |
|---------------|----------------------------------------------|---------|
| `-f, --force` | Force reset for non-development environments | `false` |
| `-y, --yes`   | Skip confirmation prompt                     | `false` |

---

## `weaver seed`

```
weaver seed|sd [options]
```

Seed the database.

| Option                  | Description                                                         | Default               |
|-------------------------|---------------------------------------------------------------------|-----------------------|
| `--seedersPath [path]`  | Seeders directory path                                              | `config.SEEDERS_PATH` |
| `-b, --buildProject`    | Build the project before seeding                                    | `false`               |
| `-p, --project`         | TypeScript project build config file (used when `-b` is set)        | `tsconfig.build.json` |
| `-c, --continueOnError` | Continue seeder execution if error is thrown                        | `false`               |
| `-f, --fixWarnings`     | Fix all seeder warnings like wrong checksum or deleted seeder files | `false`               |

---

## `weaver start`

```
weaver start|s [options]
```

Start the application.

| Option          | Description                                                 | Default         |
|-----------------|-------------------------------------------------------------|-----------------|
| `-p, --project` | TypeScript project config file                              | `tsconfig.json` |
| `-w, --watch`   | Run in watch mode (recompiles and restarts on file changes) | `false`         |

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

| Option                     | Description                             | Default                                  |
|----------------------------|-----------------------------------------|------------------------------------------|
| `-d, --dir [tempDir]`      | Directory for temporary test data       | `./temp`                                 |
| `--modelPattern [pattern]` | Glob pattern for finding model files    | `config.RESOURCE_MODEL_PATTERN`          |
| `--schemaPath [path]`      | Output path for generated Prisma schema | `config.DATABASE_SCHEMA_PATH`            |
| `--clientPath [path]`      | Output path for generated Prisma client | `config.DATABASE_CLIENT_OUTPUT_DIR_PATH` |
| `--migrationName [name]`   | Name for the initial migration          | `init_test`                              |
| `--verbose`                | Print verbose output                    | `false`                                  |

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

Update the Appweaver packages.

**Arguments:**

| Argument   | Description                                                                                                     | Default                               |
|------------|-----------------------------------------------------------------------------------------------------------------|---------------------------------------|
| `packages` | A list of packages to update (e.g. `@appweaver/core @appweaver/cli`). Only `@appweaver/*` packages are updated. | All installed `@appweaver/*` packages |

**Options:**

| Option                            | Description                                                | Default    |
|-----------------------------------|------------------------------------------------------------|------------|
| `--targetVersion [targetVersion]` | The version to update the packages to                      | `"latest"` |
| `--noSkill`                       | Skip updating AI agents skill files in the current project | `false`    |
| `-f, --force`                     | Force update despite peerDependency version mismatches     | `false`    |
| `--verbose`                       | Print verbose output                                       | `false`    |
