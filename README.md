# Appweaver

> Simple, fast, and reliable web application builder for TypeScript and Node.js (or Bun).

Appweaver is a batteries-included framework built on top of **Fastify** and **Prisma**. It provides factory methods, a
CLI, and conventions so you can focus on business logic instead of boilerplate.

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
npm run dev           # watch mode — recompiles and restarts on changes
npm run start         # production
```

---

## Packages

### `@appweaver/core`

The heart of the framework. Provides factory functions for creating resources (models, services, routes, policies),
authentication, dependency injection, file storage, queues, cron scheduler, mailer, caching, events, and the HTTP
server.

```ts
import { createApp, createModel, createService, createRoutes, createPolicy } from '@appweaver/core';

// Bootstrap the application
createApp().catch(console.error);
```

Resources follow a simple dependency chain: **model → service → routes → policy**. Define each in its own file under
`src/resources/<name>/` and the framework autoloads them on startup.

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
weaver update                     # update all @appweaver/* packages
```

### `@appweaver/client`

A type-safe HTTP client generator. Reads your OpenAPI spec and emits typed TypeScript interfaces and a client class with
built-in JWT, API key, and HTTP Basic auth support.

```sh
# Generate a typed client from a running server
weaver openapi --outputPath ./openapi.json
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
const avatarFile = await client.files.public(file.url);
const avatarData = await avatarFile.base64();

// Delete the user
await client.user.delete(user.id);
```

### `create-weaver-app`

Project scaffolding tool. Generates a complete Appweaver application from a template with support for Node and Bun
runtimes, multiple databases, and optional modules (queue, mailer, scheduler).

```sh
npx create-weaver-app <name> [description] [options]
```

---

## Building a resource

A resource is the core building block of an Appweaver API. Create four files under `src/resources/<name>/`:

**model.ts** — defines database fields, relations, files, and I/O restrictions:

```ts
import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Post',
  scalars: {
    title: { type: 'string', minLength: 1, maxLength: 200 },
    body: { type: 'string' },
    published: { type: 'boolean', default: false }
  }
});
```

**service.ts** — business logic and lifecycle hooks:

```ts
import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Post',
  afterCreate: (post) => console.log('created:', post.id)
});
```

**routes.ts** — which CRUD endpoints to expose and their auth/cache settings:

```ts
import { createRoutes } from '@appweaver/core';

export default createRoutes({
  modelName: 'Post',
  find: { roles: ['Admin', 'User'] },
  create: { permissions: ['post:create'] },
  delete: { exclude: true }
});
```

**policy.ts** — row-level access control:

```ts
import { createPolicy } from '@appweaver/core';

export default createPolicy({
  modelName: 'Post',
  readRestrictions: () => ({ published: true })
});
```

After any model change, regenerate types and create a migration:

```sh
weaver generate
weaver migration new <describe_the_change>
```

---

## License

UNLICENSED
