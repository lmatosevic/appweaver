<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The HTTP server of Appweaver, the AI-first <a href="https://nodejs.org" target="_blank">Node.js</a> framework for backends built with agents.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/web" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/web.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/web.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/web" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/web.svg" alt="NPM Downloads" /></a>
</p>

## Description

`@appweaver/web` is the HTTP module of [Appweaver](https://github.com/lmatosevic/appweaver), built on
[Fastify](https://fastify.dev):

- **Server** – the `HttpServer` lifecycle service, Swagger, `registerRoute`, `registerPlugin` and `registerModel`.
- **Resource routes** – `createRoutes` with the CRUD, query, aggregate, export and file routes of a model.
- **Security** – JWT, API key, HTTP Basic and OAuth2 authentication, 2FA, email verification, password reset,
  reCAPTCHA and Cloudflare Turnstile.
- **Errors** – RFC 9457 problem details for every framework and application error code.

An application without a server leaves it out with `app.modulesDisabled: ["@appweaver/web"]`, or does not install it.

## Installation

```sh
npm install @appweaver/web @appweaver/data
```

```ts
// src/resources/post/routes.ts
import { createRoutes } from '@appweaver/web';

export default createRoutes({
  modelName: 'Post',
  query: { public: true }
});
```

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
