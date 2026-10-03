<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The core of Appweaver, the AI-first <a href="https://nodejs.org" target="_blank">Node.js</a> framework for backends built with agents.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/core" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/core.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/core" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/core.svg" alt="NPM Downloads" /></a>
</p>

## Description

`@appweaver/core` is the runtime of an Appweaver application. It builds a [Fastify](https://fastify.dev) server and a
[Prisma](https://prisma.io) data layer from declarative resource definitions, and provides:

- **Resources** – `createModel`, `createService`, `createRoutes`, and `createPolicy` factories for validated CRUD
  routes with filtering, sorting, cursor pagination, aggregation, export, and an OpenAPI specification.
- **Security** – JWT, API key, HTTP Basic, and OAuth2 authentication, roles and permissions, row-level policies, 2FA,
  email verification, password reset, and reCAPTCHA.
- **Infrastructure** – file storage with image processing, Redis or in-memory caching and rate limiting, BullMQ or
  in-memory queues, a cron scheduler, an SMTP mailer, events, health checks, and database seeders.
- **Dependency injection** – `define`, `inject`, `injectService`, and `loadProvider` for wiring providers by token.

## Installation

New projects are best created with [`create-weaver-app`](https://www.npmjs.com/package/@appweaver/create-weaver-app),
which installs this package along with the `weaver` CLI. To add it by hand:

```sh
npm install @appweaver/core @appweaver/common @prisma/client
npm install -D @appweaver/cli prisma typescript
```

## Usage

```ts
// src/main.ts
import { createApp } from '@appweaver/core';
import { logger } from '@appweaver/common';

createApp().catch((err) => logger.error(err));
```

```ts
// src/resources/post/model.ts
import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Post',
  scalars: {
    title: { type: 'string', minLength: 1, maxLength: 200 },
    body: { type: 'string' }
  }
});
```

Run `weaver generate` after changing a model to refresh the generated types and the Prisma schema.

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
