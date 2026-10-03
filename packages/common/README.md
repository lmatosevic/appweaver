<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  Shared configuration, logger, types, and utilities of <a href="https://appweaver.co" target="_blank">Appweaver</a>.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/common" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/common.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/common.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/common" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/common.svg" alt="NPM Downloads" /></a>
</p>

## Description

`@appweaver/common` holds what every other Appweaver package builds on:

- **Configuration** – the `config` object, loaded from `appweaver.json`, its `appweaver.<env>.json` overlay, `.env`
  files, and environment variables, validated against a schema.
- **Logger** – the `logger` instance, a configured [Pino](https://getpino.io) logger.
- **Types** – the resource model, query filter, sort, aggregate, policy, and route types, and the `ResourceRegistry`
  that `weaver generate` fills so the factories infer the model types from a model name.
- **Infrastructure contracts** – the abstract `Database`, `Cache`, `Memory`, `Queue`, `Storage`, `Mailer`, `Events`,
  and `SecurityStore` classes the providers of `@appweaver/core` implement.
- **Utilities** – string, object, date, and version helpers such as `randomString` and `compareVersions`.

## Installation

It is installed with `@appweaver/core`, and is rarely added on its own:

```sh
npm install @appweaver/common
```

## Usage

```ts
import { config, logger, randomString } from '@appweaver/common';

logger.info({ port: config.SERVER_PORT }, 'Starting the server');

const token = randomString(32);
```

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
