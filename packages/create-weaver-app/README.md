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
per environment, a seeded admin user, Docker files, the test setup, and the agent skill files for the chosen AI agent.

## Usage

```sh
npx @appweaver/create-weaver-app <name> [description] [options]
```

```sh
npx @appweaver/create-weaver-app MyApp "My awesome API" --database postgresql --no-queue
```

| Flag               | Description                                                                       | Default      |
|--------------------|-----------------------------------------------------------------------------------|--------------|
| `-o, --output-dir` | Output directory (use ./ for current working directory)                           | project name |
| `--database`       | `sqlite`, `postgresql`, `mysql`, `sqlserver`                                      | `sqlite`     |
| `--host`           | Hostname or IP address where the application server will bind                     | `0.0.0.0`    |
| `--port`           | Port number where the application server will listen                              | `5000`       |
| `--agent`          | `claude`, `codex`, `junie`, `cursor`, `copilot`, `opencode`, `kiro`, `pi`, `none` | `claude`     |
| `--bun`            | Use Bun as the application runtime                                                | Node         |
| `--no-install`     | Skip the installation of the dependencies                                         | installs     |
| `--no-docker`      | Skip the Dockerfile and docker-compose.yml files                                  | copied       |
| `--no-redis`       | Skip IoRedis, use the in-memory cache, rate limit, and queue                      | installed    |
| `--no-queue`       | Skip BullMQ, use the in-memory queue                                              | installed    |
| `--no-mailer`      | Skip Nodemailer and disable the mailer                                            | installed    |
| `--no-cron`        | Skip Cron and disable the scheduler                                               | installed    |

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
