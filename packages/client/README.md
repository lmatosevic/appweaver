<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  A type-safe HTTP client and generator for <a href="https://appweaver.co" target="_blank">Appweaver</a> APIs.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/client" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/client.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/client.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/client" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/client.svg" alt="NPM Downloads" /></a>
</p>

## Description

`@appweaver/client` has two parts:

- **Generator** – the `weaver-client` binary reads an OpenAPI v3 schema (JSON or YAML, from a file or a URL) and emits
  the TypeScript types and a client class with a typed module per resource, plus the auth, account, health, and files
  routes.
- **Runtime** – the `FetchClient` base class (and `AngularClient` from `@appweaver/client/angular`) with JWT Bearer,
  API key, and HTTP Basic authentication, refresh tokens, timeouts, and middleware.

## Installation

```sh
npm install @appweaver/client
```

## Usage

```sh
weaver openapi --output-path ./openapi.json
weaver-client generate ./openapi.json --output-path ./src/generated/client.ts
```

```ts
import { createClient } from './src/generated/client';

const client = createClient({ baseUrl: 'http://localhost:5000', auth: { apiKey: 'myApiKey' } });

const posts = await client.post.query({ filter: { published: true }, sort: '-createdAt' });
```

See the [client reference](https://github.com/lmatosevic/appweaver/blob/main/skill/references/client.md) for every generator option and client module.

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
