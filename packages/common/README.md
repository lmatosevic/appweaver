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
<a href="https://github.com/lmatosevic/appweaver/actions/workflows/ci.yml?query=branch%3Amain" target="_blank"><img src="https://img.shields.io/github/actions/workflow/status/lmatosevic/appweaver/ci.yml?branch=main&label=CI" alt="CI Status" /></a>
<a href="https://github.com/lmatosevic/appweaver/actions/workflows/ci.yml?query=branch%3Amain" target="_blank"><img src="https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Flmatosevic%2Fappweaver%2Fbadges%2Fcoverage.json" alt="Test Coverage" /></a>
<a href="https://nodejs.org" target="_blank"><img src="https://img.shields.io/node/v/@appweaver/common.svg" alt="Node Version" /></a>
</p>

## Description

`@appweaver/common` holds what every other Appweaver package builds on:

- **Configuration** – `defineConfig`, declaring the config sections every package and application reads by their
  short key names (`appConfig.ENV`), each validated by its TypeBox schema, from `appweaver.json` with its
  `environments` sections, the optional `appweaver.<env>.json` overlay, `.env` files, and environment variables, and
  the `config` accessors (`config.str()`, `config.int()`, ...) reading any flattened key as it is.
- **Logger** – the `logger` instance, a configured [Pino](https://getpino.io) logger.
- **Types** – the resource model, query filter, sort, aggregate, policy, and route types, and the `ResourceRegistry`
  that `weaver generate` fills so the factories infer the model types from a model name.
- **Infrastructure contracts** – the abstract `Database`, `Cache`, `Memory`, `Queue`, `Scheduler`, `Storage`,
  `Mailer`, `SmsSender`, `Events`, `TemplateEngine`, `ImageProcessor`, `SecurityStore` and `TimeSeries` classes the
  drivers implement.
- **Errors** – `AppweaverError` and its subclasses (`ResourceError`, `MailerError`, `SmsError`, ...), each carrying an
  `ErrorCode` and its typed details, which `@appweaver/web` responds with as RFC 9457 problem details.
- **Modules** – `defineModule`, the manifest of a module declaring its contracts, providers, services, setup,
  resources and startup code, the same format for the framework's own modules, npm packages, and the `src/modules/`
  of an app.
- **Lifecycle** – the `OnInit`, `OnReady`, `OnShutdown`, and `OnDestroy` hooks of the application services.
- **Utilities** – string, object, date, and version helpers such as `randomString` and `compareVersions`.

## Installation

It is installed with `@appweaver/core`, and is rarely added on its own:

```sh
npm install @appweaver/common
```

## Usage

```ts
import { appConfig, logger, randomString } from '@appweaver/common';

logger.info({ env: appConfig.ENV }, 'Starting the application');

const token = randomString(32);
```

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
