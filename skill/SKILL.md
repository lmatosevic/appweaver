---
name: appweaver
description: >
  Use this skill whenever the user is building, debugging, scaffolding, or
  asking questions about Appweaver - a web development library. Triggers
  include: any mention of 'Appweaver', requests to create backend server logic,
  configurations, resources, models, routes, services and security policy, 
  questions about the file conventions or config system. Use this skill
  if @appweaver npm package or Appweaver is detected anywhere in the project
  structure of Node.js (TypeScript) project.
---

# Appweaver skill

## Purpose

Appweaver is a library for building web applications with TypeScript and Node.js. It provides a set of tools and
conventions to simplify the development process, including file-based routing, reusable UI components, and centralized
configuration. It is based mainly on Fastify for web server and Prisma for database ORM. The library provides a series
of factory methods used for creating resource models, services, policies, and routes with predefined defaults. It
provides a CLI tool for building the application, starting a server, generating schema and types, executing migrations,
running seeders, testing, and more.

## Project structure

The basic project structure is the following:

- `database/` - database migrations, seeders, generated prisma client, and client used by the application
- `dist/` - the output directory for transpiled JavaScript files
- `public/` - publicly exposed files if static file serving is enabled
- `src/features/` - main application logic structured using vertical slice architecture (VSA)
- `src/plugins/` - application plugins that extend or modify the library behavior
- `src/resources/` - application resources (models, services, policies, and routes)
- `src/types/` - application types (generated and manually created)
- `src/main.ts` - the main application entrypoint
- `test/e2e/` - the end-to-end tests root directory
- `test/unit/` - the unit tests root directory
- `.env` - override the central configuration (optional)
- `.env.{env}` - override the central configuration for specific envirnment (optional)
- `appweaver.json` - central library configuration file
- `appweaver.{env}.json` - environment specific configuration files that override the central configuration
- `Dockerfile` - the dockerfile used for building a docker image for deploying the application

## Core patterns

### Creating application

```ts
createApp().catch((err) => console.error(err));
```

### Creating a resource model

```ts
// src/resources/product/model.ts
import { createModel } from '@appweaver/core';

export default createModel({
  name: 'Product',
  id: {
    type: 'int',
    generator: 'autoincrement()'
  },
  audit: {
    createdAt: true,
    updatedAt: true,
    createdById: true
  },
  scalars: {
    title: {
      type: 'string',
      minLength: 1,
      maxLength: 200
    },
    price: {
      type: 'float',
      minimum: 0
    },
    status: {
      type: 'enum',
      default: 'Draft',
      values: ['Draft', 'Active', 'Sold']
    },
    description: {
      type: 'string',
      required: false
    },
    enabled: {
      type: 'boolean',
      default: true
    }
  },
  relations: {
    category: {
      model: 'Category',
      owner: true,
      output: { type: 'always' }
    }
  },
  files: {
    photo: {
      mimeType: 'image/*',
      maxSize: '2 MB'
    }
  },
  create: {
    omit: ['status']
  },
  update: {
    pick: ['title', 'price', 'status', 'description']
  },
  index: ['title']
});
```

### Creating a resource service

```ts
// src/resources/product/service.ts
import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Product',
  afterCreate: (resource) => {
    console.log('Product created:', resource.id);
  },
  textSearch: {
    title: { contains: '{input}', mode: 'insensitive' }
  }
});
```

### Creating the resource routes

```ts
// src/resources/product/routes.ts
import { createRoutes } from '@appweaver/core';

export default createRoutes({
  modelName: 'Product',
  path: '/products',
  find: { roles: ['Admin', 'User'] },
  query: { cache: true, cacheTTL: 300 },
  create: { permissions: ['product:create'] },
  delete: { exclude: true }
});
```

### Creating a resource policy

```ts
// src/resources/product/policy.ts
import { createPolicy } from '@appweaver/core';

export default createPolicy({
  modelName: 'Product',
  checkAccess: (action, resource) => resource.status === 'Draft',
  readRestrictions: (action, resource) => {
    enabled: true;
  },
  files: {
    photo: { accessType: 'public' }
  }
});
```

### Registering a custom route

Use `registerRoute` to register a custom [Fastify route](https://fastify.dev/docs/latest/Reference/Routes/) handler. The
handler is a Fastify plugin function that defines one or more routes. An optional config object controls authentication,
caching, and reCAPTCHA behavior.

```ts
// src/plugins/custom-route.ts
import { registerRoute, Router } from '@appweaver/core';
import { Type } from '@sinclair/typebox';

registerRoute(
  async function (router: Router) {
    router.get('/search-result', {
      schema: {
        summary: 'Sample search result response route',
        response: {
          200: Type.Ref('SearchResult')
        }
      },
      handler: async () => {
        return { message: 'Hello, world!' };
      }
    });
  },
  { public: true, cacheTTL: 15000 }
);
```

### Registering a custom model

Use `registerModel` to register a custom [TypeBox](https://github.com/sinclairzx81/typebox) schema as a named model.
Registered models are added to the schema registry and can be referenced by `$ref` in route schemas.

```ts
// src/plugins/custom-model.ts
import { registerModel } from '@appweaver/core';
import { Type } from '@sinclair/typebox';

registerModel(
  'SearchResult',
  Type.Object({
    id: Type.Number(),
    title: Type.String(),
    score: Type.Number({ minimum: 0, maximum: 1 })
  })
);
```

### Registering plugin

Use `registerPlugin` to register a custom [Fastify plugin](https://fastify.dev/docs/latest/Reference/Plugins/). Plugins
are registered with `fastify-plugin` so their decorators and hooks are scoped to the entire server. You can declare
optional dependencies on other named plugins.

```ts
// src/plugins/audit-log.ts
import { registerPlugin } from '@appweaver/core';

registerPlugin(
  'audit-log',
  async (server) => {
    server.addHook('onResponse', async (request, reply) => {
      console.log(`${request.method} ${request.url} → ${reply.statusCode}`);
    });
  }
);
```

### Dependency injection

## Common tasks

### Build application

```sh
weaver build
```

### Start application

```sh
weaver start          # production
weaver start --watch  # development (watch mode)
```

### Generate types and schema

```sh
weaver generate --types             # TypeScript types only
weaver generate --schema            # Prisma schema only
weaver generate --types --schema    # both
```

### Run database migrations

```sh
weaver migrate                      # run pending migrations
weaver migration new <name>         # create a new migration
weaver migration reset              # reset database (prompts confirmation)
weaver migration reset --force --yes  # force reset, skip confirmation
```

### Seed the database

```sh
weaver seed                         # run seeders
weaver seed --buildProject          # build project first, then seed
weaver seed --continueOnError       # continue if a seeder throws
```

### Run tests

```sh
npm run test        # unit tests with coverage
npm run e2e         # e2e tests
```

### Format code

```sh
npm run format  # prettier --write "./**/*.ts"
```

### Lint code

```sh
npm run lint    # eslint "./**/*.ts"
```

## References

- Application configuration: [references/configuration.md](references/configuration.md)
- Application resources: [references/resources.md](references/resources.md)
- Security details: [references/security.md](references/security.md)
- Examples: [references/examples.md](references/examples.md)
