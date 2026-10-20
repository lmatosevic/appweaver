<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The data layer of Appweaver, the AI-first <a href="https://nodejs.org" target="_blank">Node.js</a> framework for backends built with agents.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/data" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/data.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/data.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/data" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/data.svg" alt="NPM Downloads" /></a>
</p>

## Description

`@appweaver/data` is the database module of [Appweaver](https://github.com/lmatosevic/appweaver), built on
[Prisma](https://prisma.io):

- **Resources** – `createModel`, `createService` and `createPolicy`, the resource services with filtering, sorting,
  cursor pagination, aggregation and CSV export, and the transactions.
- **Auth data model** – `createAuthModel`, `createAuthService`, roles, permissions, API keys, one-time tokens,
  connected accounts and password hashing.
- **Files** – `FileService` with the File model, storing the files in any `Storage` provider.
- **Seeders** – `createSeeder` and the database security store.

The framework models reach only the applications using them: the auth tables with an auth model, File with a model
declaring `files`, Seeder with a seeders directory.

## Installation

```sh
npm install @appweaver/data @prisma/client
npm install -D prisma
```

```ts
// src/resources/post/model.ts
import { createModel } from '@appweaver/data';

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
