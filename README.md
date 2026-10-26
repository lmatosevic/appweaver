<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The AI-first <a href="https://nodejs.org" target="_blank">Node.js</a> framework for quick scaffolding, extending, and shipping backends with agents.
</p>

<p align="center">
<a href="https://www.npmjs.com/@appweaver/core" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/core.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/@appweaver/core" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/core.svg" alt="NPM Downloads" /></a>

</p>

## Description

Appweaver is a batteries-included framework built on top of [Fastify](https://fastify.dev) and
[Prisma](https://prisma.io), designed from the ground up to be developed with AI agents. Instead of writing backend
boilerplate from scratch, you describe resources using concise factory functions and let the framework handle routing,
validation, database, auth, migrations, so you can focus on business logic instead of boilerplate.

### Built for agents

- **80% fewer tokens** → Appweaver's conventions and factory API eliminate the boilerplate that dominates most backend
  codebases. Your agent reads and writes only the code that matters, not hundreds of lines of scaffolding.
- **Zero-code configuration** → every framework behavior like HTTP server, database, auth, queues, mailer, cache,
  storage is controlled through `appweaver.json` config files or environment variables. No code changes are needed to
  reconfigure the app for a different environment.
- **Agent-first conventions** → a consistent, predictable project structure means agents always know where to find and
  place code: models, services, routes, and policies each live in their own file under `src/resources/<name>/`.
- **Built-in skill files** → every scaffolded project ships with agent-readable skill files that give your agent harness
  a complete map of the framework's API, conventions, and CLI, which means no hallucination, and no trial-and-error.
- **Works with any agent harness** → Claude Code, Cursor, Codex, Copilot Workspace, or any coding assistant that can
  read project files. Point your agent at the skill files, and it has everything it needs to quickly build applications.

## Requirements

- Node >= 24.7 (or Bun >= 1.4)
- NPM >= 6

Optional:

- SQLite >= 3, PostgreSQL >= 15, MariaDB >= 10, or SQL Server >= 2022
- Redis >= 5

---

## Getting started

### 1. Scaffold a new project

Bootstrap the new application with the scaffolding tool, `@appweaver/create`:

```sh
npm create @appweaver MyApp "My awesome API" -- --database postgresql --add web redis mailer docker
```

npm passes the options after `--` to the tool. `npx @appweaver/create MyApp ...` takes them directly, and a global
install (`npm install -g @appweaver/create`) runs it as `create-appweaver`.

This creates a `./my-app` directory, installs all dependencies, and runs the initial schema and type generation. The
base project is a minimal application of `@appweaver/core`, without a database or a server: add the modules with
`--add` (`data` for the database, `web` for the HTTP server), all of them with `--all` (leaving some out with
`--exclude`), or later with `weaver module add`.

Without the scaffolder, an API installs the runtime, the database and the server packages, and a driver package for
each library it uses (never the library itself):

```sh
npm install @appweaver/core @appweaver/common @appweaver/data @appweaver/web @appweaver/cli
npm install @prisma/client prisma @sinclair/typebox @prisma/adapter-pg  # the driver adapter of your database
npm install -D typescript
npm install @appweaver/redis @appweaver/bullmq @appweaver/nodemailer  # optional drivers
```

The driver adapters are `@prisma/adapter-pg` (PostgreSQL), `@prisma/adapter-mariadb` (MySQL / MariaDB),
`@prisma/adapter-better-sqlite3` (SQLite, `@prisma/adapter-libsql` on Bun) and `@prisma/adapter-mssql` (SQL Server).
`@appweaver/cli` and `prisma` are dependencies rather than dev dependencies, since a production image runs
`weaver start` and `weaver migrate`.

Common options:

| Flag                     | Description                                                                              | Default      |
|--------------------------|------------------------------------------------------------------------------------------|--------------|
| `-o, --output-dir`       | Output directory (use ./ for current working directory)                                  | project name |
| `--database`             | `sqlite`, `postgresql`, `mysql`, `sqlserver`, with the `data` module                     | `sqlite`     |
| `--host`                 | Hostname or IP address where the server of the `web` module will bind.                   | 0.0.0.0      |
| `--port`                 | Port number where the server of the `web` module will listen.                            | 5000         |
| `--agent`                | The AI agent for which to configure guidelines and skill files                           | `claude`     |
| `--add <modules...>`     | `data`, `web`, `redis`, `queue`, `scheduler`, `mailer`, `templates`, `locales`, `docker` | none         |
| `--all`                  | Add every module                                                                         | false        |
| `--exclude <modules...>` | Modules to leave out of `--all`                                                          | none         |
| `--bun`                  | Use Bun as application runtime.                                                          | false        |
| `--no-install`           | Skip all dependencies installation.                                                      | installs     |

### 2. Run the initial migration and seed

```sh
weaver migration new init
npm run seed
```

### 3. Start the dev server

```sh
npm run dev           # watch mode, recompiles and restarts on changes
npm run start         # production
```

---

## Configuration

Appweaver is configured through the `appweaver.json` file at the project root. Its `config` holds the base
configuration, and its `environments` the overrides of each environment, merged over it based on `NODE_ENV`
(`development` resolves to `dev`, `production` or an unset `NODE_ENV` to `prod`):

```json
{
  "config": {
    "server": { "port": 5000 },
    "database": { "url": "file:./data/app.db" }
  },
  "environments": {
    "dev": { "log": { "level": "debug", "pretty": true } },
    "test": { "database": { "url": "file:./temp/test.db" } }
  }
}
```

An environment can also keep its overrides in a separate `appweaver.<env>.json` file (i.e. `appweaver.prod.json`
mounted into a container), under its `config` key, which is loaded over the matching `environments` section.

Every option can also be set via an environment variable which useful for secrets and CI/CD. The full list of options
is documented in [`skill/references/configuration.md`](./skill/references/configuration.md) and available
in [appweaver.example.json](appweaver.example.json) or [.env.example](.env.example).

`weaver config schema` writes the JSON Schema of `appweaver.json` from the config sections of the enabled modules
(point its `$schema` to `./appweaver.schema.json`), `weaver config print` shows every value with its source and the
secrets hidden, and `weaver config check` validates them, i.e. with `NODE_ENV=prod` in CI.

---

## Skills for AI Agents

The `./skill` directory contains structured, agent-readable documentation that gives your AI coding assistant a
complete understanding of Appweaver's architecture, APIs, conventions, and CLI without burning tokens re-reading
source code on every task.

### How it works

When you scaffold a new project with `@appweaver/create`, the generated `AGENTS.md` (or `CLAUDE.md`) at the project
root automatically references the skill files. Any agent harness that supports project-level instruction files (Claude
Code, Cursor, Codex, etc.) will load these as context, giving the agent accurate, up-to-date guidance.

### Skill file index

The `./skill` directory contains two files any agent can load to use Appweaver as a development framework:

- [`skill/SKILL.md`](./skill/SKILL.md) – complete framework reference for agents: architecture, factory APIs, CLI
  commands, and conventions.
- [`skill/GUIDELINES.md`](./skill/GUIDELINES.md) – development guidelines: project structure, code style, workflow
  steps, and common patterns.

### Keeping skill files up to date

After upgrading Appweaver packages in a project, skill files are refreshed automatically:

```sh
weaver upgrade    # upgrades packages and refreshes agent skill files
```

---

## Building a resource

A resource is the core building block of an Appweaver API. Create four files under `src/resources/<name>/`:

**model.ts** – defines database fields, relations, files, and I/O restrictions:

```ts
import { createModel } from '@appweaver/data';

export default createModel({
  name: 'Post',
  scalars: {
    title: { type: 'string', minLength: 1, maxLength: 200 },
    slug: { type: 'string', unique: true },
    body: { type: 'string' },
    views: { type: 'int', minimum: 0 },
    status: { type: 'enum', values: ['Draft', 'Published', 'Archived'], default: 'Draft' },
    published: { type: 'boolean', default: false }
  },
  relations: {
    author: { model: 'User', type: 'manyToOne', mappedBy: 'posts', required: false }
  },
  files: {
    gallery: { array: true, mimeType: 'image/*', maxSize: '5 MB', maxCount: 25 }
  },
  index: ['slug']
});
```

**service.ts** – business logic and lifecycle hooks:

```ts
import { createService } from '@appweaver/data';

export default createService({
  modelName: 'Post',
  afterCreate: (post) => console.log('created:', post.id)
});
```

**routes.ts** – which CRUD endpoints to expose and their auth/cache settings:

```ts
import { createRoutes } from '@appweaver/web';

export default createRoutes({
  modelName: 'Post',
  find: { roles: ['Admin', 'User'] },
  query: { cacheTTL: 5000 },
  create: { permissions: ['post:create'] },
  delete: { exclude: true }
});
```

**policy.ts** – row-level access control (the user is `null` for an unauthenticated request):

```ts
import { createPolicy } from '@appweaver/data';

export default createPolicy({
  modelName: 'Post',
  readRestrictions: (user) => (user ? { author: { id: user.id } } : { published: true })
});
```

After any model change, regenerate types and Prisma schema:

```sh
weaver generate  # generates types and Prisma schema
```

When ready, generate a migration file and apply it to the database:

```sh
weaver migration new <describe_the_change>  # creates a new migration file
weaver migrate                              # apply new database migration
```

---

## Packages

### `@appweaver/core`

The runtime of every application, with neither a server nor a database: the modules, the lifecycle, dependency
injection, the auth user context, and the in-process drivers (memory, cache, queue, events, local file storage), with
the email, locale and health services.

```ts
import { createApp } from '@appweaver/core';

// Bootstrap the application
createApp().catch(console.error);
```

The application is assembled from modules: core, the npm packages declaring an `appweaver.module` field (the
`@appweaver/*` packages below among them), and the local `src/modules/*/module.ts`. A package module is enabled by
being a dependency of the project, and a driver is selected by its `provider` key (`auto` by default). See
[`skill/references/modules.md`](./skill/references/modules.md).

### `@appweaver/data`

The database module, built on Prisma: the factory functions of the resources (`createModel`, `createService`,
`createPolicy`), the resource services, the auth data model (`createAuthModel`, `createAuthService`, roles,
permissions, API keys), `FileService`, the seeders and the CSV export.

Only the model is required: a service needs the model, routes need the service, and an optional policy needs only
the model. Define each in its own file under `src/resources/<name>/` and the framework autoloads them on startup. They
can also be created and exported from a single file.

### `@appweaver/web`

The HTTP module, built on Fastify: the server, the resource routes (`createRoutes`), custom routes and plugins
(`registerRoute`, `registerPlugin`), JWT, API key, Basic and OAuth2 authentication, the RFC 9457 problem details and
Swagger. It requires `@appweaver/data`, and an application without a server leaves it out.

### Drivers

One package per library, each carrying the library as a dependency and enabled by installing it:

| Package                 | Provides                                                                 |
|-------------------------|--------------------------------------------------------------------------|
| `@appweaver/redis`      | The `redis` memory (ioredis), also the store of the cache and rate limit |
| `@appweaver/bullmq`     | The `bullmq` queue, requires `@appweaver/redis`                          |
| `@appweaver/cron`       | The `cron` scheduler                                                     |
| `@appweaver/nodemailer` | The `smtp` mailer                                                        |
| `@appweaver/handlebars` | The `handlebars` template engine                                         |
| `@appweaver/sharp`      | The `sharp` image processor of the uploads                               |

### `@appweaver/testing`

The test helpers of the packages and their modules: `resetContext`, `linkModels` and `createDatabaseStub`, and the
contract suites testing a driver against its contract (`testStorageContract('GcsStorage', () => new GcsStorage())`,
also for `Memory`, `Queue`, `Scheduler` and `Mailer`), under Jest, Vitest or Bun.

### `@appweaver/common`

Shared utilities, configuration loader, logger, and base TypeScript types used by all other packages. You generally
consume this indirectly, but it also exports the `config` object and the `logger` instance for use in your application
code.

```ts
import { config, logger, randomString } from '@appweaver/common';
```

### `@appweaver/cli` (`weaver`)

The `weaver` CLI drives the entire developer workflow.

```sh
weaver build                      # compile TypeScript
weaver start --watch              # dev server with hot reload
weaver generate                   # generate types + Prisma schema from models
weaver migration new <name>       # create a new database migration
weaver migrate                    # apply pending migrations
weaver seed                       # seed the database
weaver openapi                    # export OpenAPI spec to openapi.json
weaver run src/tasks/report.ts    # run a one-shot task with the application
weaver module add redis docker    # add modules to the project (list, add, remove)
weaver module add appweaver-gcs   # install a module package, print its providers
weaver module new audit-log       # create a local module in src/modules/audit-log/
weaver config check               # validate the config of every enabled module (schema, print)
weaver upgrade                    # upgrade all @appweaver/* packages and skill files
```

### `@appweaver/client` (`weaver-client`)

A type-safe HTTP client generator. Reads your OpenAPI spec and emits typed TypeScript interfaces and a client class with
built-in JWT, API key, and HTTP Basic auth support.

```sh
# generate OpenAPI specification from the current project
weaver openapi --output-path ./openapi.json

# generate a typed client class for interacting with the API
weaver-client generate ./openapi.json --output-path ./src/generated/client.ts
```

```ts
import { createClient } from './src/generated/client';

const client = createClient({ baseUrl: 'http://localhost:5000', auth: { apiKey: 'myApiKey' } });

// Create a new user
const user = await client.user.create({ name: 'Jane Doe', email: 'jane@example.com', password: 'secret' });

// Find the user by ID
const foundUser = await client.user.find(user.id);

// Upload an avatar for the user
const avatar = await client.user.uploadFiles(user.id, { avatar: file });

// Get the public avatar file and transform it to base64
const avatarFile = await client.files.public(avatar.url);
const avatarData = await avatarFile.base64();

// Delete the user
await client.user.delete(user.id);
```

### `@appweaver/create` (`create-appweaver`)

Project scaffolding tool. Generates a complete Appweaver application from a template with support for Node and Bun
runtimes, multiple databases, and optional modules (Redis, queue, scheduler, mailer, templates, locales, Docker), which
`weaver module add` and `weaver module remove` manage later from the same templates. It also creates module packages,
a storage or mailer driver with its contract test, or a feature module, ready to publish.

```sh
npm create @appweaver <name> [description] -- [options]
npm create @appweaver module <package> [description] -- [--contract storage|mailer|none] [-o dir]
```

---

## Contributing

### Building the project

The project is a TypeScript monorepo. Install dependencies and build all packages with:

```sh
npm install
npm run build
```

`npm run build` performs three steps: removes `dist/` folders from all packages, runs `tsc -b` to compile everything,
then copies the built packages into `node_modules/@appweaver` so packages can reference each other locally. Rerun it
after changing a package that other packages or the samples use.

### Testing

Run the full test suite with:

```sh
npm run test
```

It fails below 80% of the branches covered. Jest maps every `@appweaver/*` import to the sources of its package, so
the tests need no build.

### Releasing

Releases are automated via **semantic-release** using conventional commits. To make a new release:

```sh
npm run release
```

This will: build all packages, determine the next version from commit messages (`fix:` → patch, `feat:` → minor,
`feat!:` / `BREAKING CHANGE` → major), generate a changelog, bump versions across all `package.json` files, publish
each package to npm, and push the release commit and tag.

Requires valid `NPM_TOKEN` and `GITHUB_TOKEN` environment variables with write access to the `@appweaver` npm
organization.

---

## License

Appweaver is [MIT licensed](LICENSE).
