<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  Scaffold a new <a href="https://appweaver.co" target="_blank">Appweaver</a> application in one command.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/create-weaver-app" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/create-weaver-app.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/create-weaver-app.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/create-weaver-app" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/create-weaver-app.svg" alt="NPM Downloads" /></a>
</p>

## Description

`create-weaver-app` generates a ready-to-run Appweaver project for Node or Bun: the source layout, configuration files
per environment, a seeded admin user, the test setup, the agent skill files for the chosen AI agent, and the optional
modules (Redis, queue, scheduler, mailer, templates, locales, Docker files).

## Usage

```sh
npx @appweaver/create-weaver-app <name> [description] [options]
```

```sh
npx @appweaver/create-weaver-app MyApp "My awesome API" --database postgresql --add redis queue docker
npx @appweaver/create-weaver-app MyApp "My awesome API" --all --no-scheduler
```

| Flag                 | Description                                                                       | Default      |
|----------------------|-----------------------------------------------------------------------------------|--------------|
| `-o, --output-dir`   | Output directory (use ./ for current working directory)                           | project name |
| `--database`         | `sqlite`, `postgresql`, `mysql`, `sqlserver`                                      | `sqlite`     |
| `--host`             | Hostname or IP address where the application server will bind                     | `0.0.0.0`    |
| `--port`             | Port number where the application server will listen                              | `5000`       |
| `--agent`            | `claude`, `codex`, `junie`, `cursor`, `copilot`, `opencode`, `kiro`, `pi`, `none` | `claude`     |
| `--add <modules...>` | Modules to add, separated by spaces or commas                                     | none         |
| `--all`              | Add every module                                                                  | false        |
| `--no-<module>`      | Leave a module out of `--all`                                                     | —            |
| `--bun`              | Use Bun as the application runtime                                                | Node         |
| `--no-install`       | Skip the installation of the dependencies                                         | installs     |

The base project depends on `@appweaver/core`, `@appweaver/data`, `@appweaver/web` and `@appweaver/sharp`, and has
none of the modules. A module installs its driver package, and a module required by an added one is added along with
it:

| Module      | Adds                                                                                | Without it                                  |
|-------------|-------------------------------------------------------------------------------------|---------------------------------------------|
| `redis`     | `@appweaver/redis`, the Redis connection, the Redis service of `docker-compose.yml` | memory, cache and rate limit in the process |
| `queue`     | `@appweaver/bullmq`, requires `redis`                                               | in-memory queue                             |
| `scheduler` | `@appweaver/cron`                                                                   | scheduler disabled                          |
| `mailer`    | `@appweaver/nodemailer`, and the account email templates with `templates`           | mailer disabled                             |
| `templates` | `@appweaver/handlebars` and `templates/`                                            | no template engine                          |
| `locales`   | `locales/en.json`                                                                   | English texts written into the templates    |
| `docker`    | `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `start.sh`                     | no Docker files                             |

The modules of an existing project are managed with the `weaver` CLI, from the same templates:

```sh
npx weaver module list
npx weaver module add templates locales
npx weaver module remove docker
```

Then create the first migration and seed the database:

```sh
cd my-app
npx weaver migration new init
npm run seed
npm run dev
```

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
