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

`@appweaver/core` is the runtime of every Appweaver application, with neither a server nor a database:

- **Modules** – the application is assembled from module manifests: the npm packages declaring an
  `appweaver.module` field (`@appweaver/data`, `@appweaver/web`, the drivers), the local `src/modules/*/module.ts`,
  and the paths of `app.modules`. A driver is selected by name in its `provider` key, `auto` by default.
- **Application** – `createApp`, the lifecycle hooks (`onInit`, `onReady`, `onShutdown`, `onDestroy`), the health
  listener of the applications without a server, and `weaver run` tasks.
- **Dependency injection** – `define`, `inject`, `injectService` and `isDefined`, the auth user context with
  `runAs`, and the transaction scope with `afterCommit`.
- **In-process drivers** – the memory, the cache, the queue, the node events, the `local` file storage and the `json`
  mailer, with `EmailService`, the locale service and the template registration.

The database, the resources and the auth data model are in [`@appweaver/data`](https://www.npmjs.com/package/@appweaver/data),
the HTTP server in [`@appweaver/web`](https://www.npmjs.com/package/@appweaver/web), and the drivers in
`@appweaver/redis`, `@appweaver/bullmq`, `@appweaver/cron`, `@appweaver/nodemailer`, `@appweaver/handlebars` and
`@appweaver/sharp`.

## Installation

New projects are best created with [`create-weaver-app`](https://www.npmjs.com/package/@appweaver/create-weaver-app),
which installs this package along with the `weaver` CLI. To add it by hand:

```sh
npm install @appweaver/core @appweaver/common
npm install -D @appweaver/cli typescript
```

## Usage

```ts
// src/main.ts
import { createApp } from '@appweaver/core';
import { logger } from '@appweaver/common';

createApp().catch((err) => logger.error(err));
```

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
