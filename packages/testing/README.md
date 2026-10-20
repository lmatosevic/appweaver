<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The testing helpers of Appweaver, the AI-first <a href="https://nodejs.org" target="_blank">Node.js</a> framework for backends built with agents.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/testing" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/testing.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/testing.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/testing" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/testing.svg" alt="NPM Downloads" /></a>
</p>

## Description

`@appweaver/testing` holds the helpers the Appweaver packages and their modules test with: `resetContext()` clears
the application context between tests, `linkModels()` links the models defined in a test, and
`createDatabaseStub()` records the queries of a stubbed Prisma client. Its contract suites test a driver against the
behavior every driver of its contract shares.

## Installation

```sh
npm install -D @appweaver/testing
```

## Contract suites

Call the suite of the driver's contract at the top level of a test file, with the name of the driver and a function
creating it. Every test gets a fresh instance:

```ts
// test/gcs-storage.test.ts
import { configOverrides } from '@appweaver/common';
import { testStorageContract } from '@appweaver/testing';
import { GcsStorage } from '../src/gcs-storage';

configOverrides.STORAGE_GCS_BUCKET = 'contract-tests';

testStorageContract('GcsStorage', () => new GcsStorage());
```

| Suite                   | Contract    | Tests                                                                             |
|-------------------------|-------------|-----------------------------------------------------------------------------------|
| `testMemoryContract`    | `Memory`    | Values and their expiry, `exists` and `delete`, key patterns, locks, health       |
| `testStorageContract`   | `Storage`   | Storing and streaming a file and a byte range, `exists`, `delete`, `url`, health  |
| `testQueueContract`     | `Queue`     | A job processed by a worker and its result, a failed job, closing a queue, health |
| `testSchedulerContract` | `Scheduler` | Adding, starting, stopping and removing a job, an unknown job id                  |
| `testMailerContract`    | `Mailer`    | Sending an email with every field of the contract, health                         |

The suites use the `describe`, `test`, `beforeEach`, `afterEach` and `expect` globals, so they run under Jest, Vitest
(with `globals: true`) and Bun. The drivers of the framework run them too (`InMemory`, `FilesystemStorage`,
`MemoryQueue`, `JsonMailer`, `CronScheduler`), and so does the test of a module package created with
`npm create @appweaver module`. Run a driver of a remote service against a test instance or an emulator, and the mailer
suite against a test inbox or a mocked transport, since it sends a real email.

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
