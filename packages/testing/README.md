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
`createDatabaseStub()` records the queries of a stubbed Prisma client.

## Installation

```sh
npm install -D @appweaver/testing
```

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
