<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  Scaffold a new <a href="https://appweaver.co" target="_blank">Appweaver</a> application or module package in one command.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/create" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/create.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/create.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/create" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/create.svg" alt="NPM Downloads" /></a>
</p>

## Description

`@appweaver/create` generates a ready-to-run Appweaver project for Node or Bun: the source layout, configuration files
per environment, a seeded admin user, the test setup, the agent skill files for the chosen AI agent, and the optional
modules (Redis, queue, scheduler, mailer, templates, locales, Docker files). It also creates
[module packages](#module-packages), the drivers and features published to npm.

## Usage

```sh
npm create @appweaver <name> [description] -- [options]
npx @appweaver/create <name> [description] [options]
```

```sh
npm create @appweaver MyApp "My awesome API" -- --database postgresql --add web redis queue docker
npx @appweaver/create MyApp "My awesome API" --all --exclude scheduler
```

npm passes the options after `--` to the `create-appweaver` binary, `npx` takes them directly.

| Flag                     | Description                                                                       | Default      |
|--------------------------|-----------------------------------------------------------------------------------|--------------|
| `-o, --output-dir`       | Output directory (use ./ for current working directory)                           | project name |
| `--database`             | `sqlite`, `postgresql`, `mysql`, `sqlserver`, the database of `data`              | `sqlite`     |
| `--host`                 | Hostname or IP address where the server of `web` will bind                        | `0.0.0.0`    |
| `--port`                 | Port number where the server of `web` will listen                                 | `5000`       |
| `--agent`                | `claude`, `codex`, `junie`, `cursor`, `copilot`, `opencode`, `kiro`, `pi`, `none` | `claude`     |
| `--add <modules...>`     | Modules to add, separated by spaces or commas                                     | none         |
| `--all`                  | Add every module                                                                  | false        |
| `--exclude <modules...>` | Modules to leave out of `--all`, separated by spaces or commas                    | none         |
| `--bun`                  | Use Bun as the application runtime                                                | Node         |
| `--no-install`           | Skip the installation of the dependencies                                         | installs     |

The base project depends only on `@appweaver/cli`, `@appweaver/common`, `@appweaver/core` and TypeBox, a minimal
application without a database or a server. A module installs its packages, and a module required by an added one is
added along with it:

| Module      | Adds                                                                                                           | Without it                                  |
|-------------|----------------------------------------------------------------------------------------------------------------|---------------------------------------------|
| `data`      | `@appweaver/data`, `@appweaver/sharp`, Prisma, `database/`, the generated types, the test database             | no database                                 |
| `web`       | `@appweaver/web`, requires `data`, the server config, the `User` auth resource, its admin seeder and `public/` | no HTTP server, no auth model               |
| `redis`     | `@appweaver/redis`, the Redis connection, the Redis service of `docker-compose.yml`                            | memory, cache and rate limit in the process |
| `queue`     | `@appweaver/bullmq`, requires `redis`                                                                          | in-memory queue                             |
| `scheduler` | `@appweaver/cron`                                                                                              | scheduler disabled                          |
| `mailer`    | `@appweaver/nodemailer`, the account email templates with `templates`, their texts with `locales`              | mailer disabled                             |
| `templates` | `@appweaver/handlebars` and `templates/`                                                                       | no template engine                          |
| `locales`   | `locales/en.json`, empty without the mailer                                                                    | English texts written into the templates    |
| `docker`    | `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `start.sh`                                                | no Docker files                             |

The modules of an existing project are managed with the `weaver` CLI, from the same templates:

```sh
npx weaver module list
npx weaver module add templates locales
npx weaver module remove docker
```

With `data`, create the first migration and seed the database:

```sh
cd my-app
npx weaver migration new init
npm run seed
npm run dev
```

## Module packages

```sh
npm create @appweaver module <package> [description] -- [options]
```

```sh
npm create @appweaver module @acme/appweaver-gcs "Google Cloud Storage driver" -- --contract storage
npx @appweaver/create module @acme/appweaver-audit
```

| Flag               | Description                                                                   | Default                        |
|--------------------|-------------------------------------------------------------------------------|--------------------------------|
| `--contract`       | The contract its driver implements: `storage`, `mailer`, `none` for a feature | `none`                         |
| `-o, --output-dir` | Output directory                                                              | package name without its scope |

The package is a module enabled by installing it: its `package.json` has the `appweaver.module` field and the
`appweaver-module` keyword, with `@appweaver/common` and `@appweaver/core` as peer dependencies. It holds the manifest
(`src/module.ts`), a config section (`src/config.ts`), and either a driver class (`GcsStorage`, `<Name>Mailer`) with a
test running the contract suite of `@appweaver/testing`, or the startup code of a feature module (`src/main.ts`), with
the TypeScript and Jest setup. The short name, without the scope and the `appweaver-` prefix (`gcs`), is the name of
its provider and of its config section (`storage.gcs` for a storage driver).

```sh
cd appweaver-gcs
npm install
npm test
npm publish
```

An application then adds it with `weaver module add @acme/appweaver-gcs`.

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview
  of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference
  shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
