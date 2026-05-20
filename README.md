<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The AI-first <a href="https://nodejs.org" target="_blank">Node.js</a> framework for quick scaffolding, extending, and shipping backends with any agent.
</p>

<p align="center">
<a href="https://www.npmjs.com/@appweaver/core" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/core.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/master/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/@appweaver/core" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/core.svg" alt="NPM Downloads" /></a>
<a href="https://www.npmjs.com/@appweaver/core" target="_blank"><img src="https://img.shields.io/badge/build-passing-brightgreen.svg" alt="Build Status" /></a>

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

- Node >= 20 (or Bun)
- NPM >= 6

Optional:

- SQLite >= 3, PostgreSQL >= 15, MariaDB >= 10, or SQL Server >= 2022
- Redis >= 5

---

## Getting started

### 1. Scaffold a new project

Install the scaffolding CLI tool:

```sh
npm install -g @appweaver/create-weaver-app
```

Bootstrap the new application:

```sh
create-weaver-app MyApp "My awesome API" --database postgresql
```

This creates a `./my-app` directory, installs all dependencies, and runs the initial schema and type generation.

Common options:

| Flag          | Description                                                    | Default      |
|---------------|----------------------------------------------------------------|--------------|
| `--outputDir` | Output directory (use ./ for current working directory)        | project name |
| `--database`  | `sqlite`, `postgresql`, `mysql`, `sqlserver`                   | `sqlite`     |
| `--host`      | Hostname or IP address where the application server will bind. | 0.0.0.0      |
| `--port`      | Port number where the application server will listen.          | 5000         |
| `--agent`     | The AI agent for which to configure guidelines and skill files | `claude`     |
| `--bun`       | Use Bun as application runtime.                                | false        |

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

Appweaver is configured through `appweaver.json` files at the project root, with environment-specific overlays loaded
automatically based on `NODE_ENV`:

| File                  | Loaded when            |
|-----------------------|------------------------|
| `appweaver.json`      | Always (base config)   |
| `appweaver.dev.json`  | `NODE_ENV=development` |
| `appweaver.test.json` | `NODE_ENV=test`        |

Every option can also be set via an environment variable which useful for secrets and CI/CD. The full list of options
is documented in [`skill/references/configuration.md`](./skill/references/configuration.md) and available
in [appweaver.example.json](appweaver.example.json) or [.env.example](.env.example).

---

## Skills for AI Agents

The `./skill` directory contains structured, agent-readable documentation that gives your AI coding assistant a
complete understanding of Appweaver's architecture, APIs, conventions, and CLI without burning tokens re-reading
source code on every task.

### How it works

When you scaffold a new project with `create-weaver-app`, the generated `AGENTS.md` (or `CLAUDE.md`) at the project
root automatically references the skill files. Any agent harness that supports project-level instruction files
(Claude Code, Cursor, Codex, etc.) will load these as context, giving the agent accurate, up-to-date guidance.

### Skill file index

The `./skill` directory contains two files any agent can load to use Appweaver as a development framework:

- [`skill/SKILL.md`](./skill/SKILL.md) – complete framework reference for agents: architecture, factory APIs, CLI
  commands, and conventions.
- [`skill/GUIDELINES.md`](./skill/GUIDELINES.md) – development guidelines: project structure, code style, workflow
  steps, and common patterns.

### Keeping skill files up to date

After upgrading Appweaver packages in a project, skill files are refreshed automatically:

```sh
weaver update     # updates packages and refreshes agent skill files
```

---

## Building a resource

A resource is the core building block of an Appweaver API. Create four files under `src/resources/<name>/`:

**model.ts** – defines database fields, relations, files, and I/O restrictions:

```ts
import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Post',
  scalars: {
    title: { type: 'string', minLength: 1, maxLength: 200 },
    slug: { type: 'string', unique: true },
    body: { type: 'string' },
    views: { type: 'int', min: 0 },
    status: { type: 'enum', values: ['Draft', 'Published', 'Archived'], default: 'Draft' },
    published: { type: 'boolean', default: false }
  },
  relations: {
    author: { model: 'User', mappedBy: 'posts', required: false }
  },
  files: {
    gallery: { array: true, mimeType: 'image/*', maxSize: '5 MB', maxCount: 25 }
  },
  index: ['slug']
});
```

**service.ts** – business logic and lifecycle hooks:

```ts
import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Post',
  afterCreate: (post) => console.log('created:', post.id)
});
```

**routes.ts** – which CRUD endpoints to expose and their auth/cache settings:

```ts
import { createRoutes } from '@appweaver/core';

export default createRoutes({
  modelName: 'Post',
  find: { roles: ['Admin', 'User'] },
  query: { cacheTTL: 5000 },
  create: { permissions: ['post:create'] },
  delete: { exclude: true }
});
```

**policy.ts** – row-level access control:

```ts
import { createPolicy } from '@appweaver/core';

export default createPolicy({
  modelName: 'Post',
  readRestrictions: (user) => ({ author: { id: user.id } })
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

The heart of the framework. Provides factory functions for creating resources (models, services, routes, policies),
authentication, dependency injection, file storage, queues, cron scheduler, mailer, caching, events, and the HTTP
server.

```ts
import { createApp } from '@appweaver/core';

// Bootstrap the application
createApp().catch(console.error);
```

Resources follow a simple dependency chain: **model → service → routes → policy**. Define each in its own file under
`src/resources/<name>/` and the framework autoloads them on startup. They can also be created and exported from a single
file.

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
weaver update                     # update all @appweaver/* packages and skill files
```

### `@appweaver/client` (`weaver-client`)

A type-safe HTTP client generator. Reads your OpenAPI spec and emits typed TypeScript interfaces and a client class with
built-in JWT, API key, and HTTP Basic auth support.

```sh
# generate OpenAPI specification from the current project
weaver openapi --outputPath ./openapi.json

# generate a typed client class for interacting with the API
weaver-client generate ./openapi.json --outputPath ./src/generated/client.ts
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

### `@appweaver/create-weaver-app` (`create-weaver-app`)

Project scaffolding tool. Generates a complete Appweaver application from a template with support for Node and Bun
runtimes, multiple databases, and optional modules (queue, mailer, scheduler).

```sh
npx create-weaver-app <name> [description] [options]
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
then copies the built packages into `node_modules/@appweaver` so packages can reference each other locally.

For active development, use watch mode to rebuild automatically on file changes:

```sh
npm run build:dev
```

### Testing

Run the full test suite with:

```sh
npm run test
```

### Releasing

Releases are automated via **semantic-release** using conventional commits. To cut a release:

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
