<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The ioredis driver of Appweaver, the AI-first <a href="https://nodejs.org" target="_blank">Node.js</a> framework for backends built with agents.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/redis" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/redis.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/redis.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/redis" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/redis.svg" alt="NPM Downloads" /></a>
</p>

## Description

`@appweaver/redis` is the Redis memory of [Appweaver](https://github.com/lmatosevic/appweaver), a module enabled by
installing it, which provides the `redis` `Memory` provider. With `auto`, the default of the `memory.provider` config key,
it is selected whenever the module is installed.

## Installation

```sh
npm install @appweaver/redis
```

or `weaver module add redis` in a project created with `@appweaver/create`.

The connection URL is `memory.redis.url` (`MEMORY_REDIS_URL`). The cache, the rate limit (`rateLimit.store` `auto`) and the BullMQ queue use its connection.

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
