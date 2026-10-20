# Modules

Every part of an Appweaver application is a module: a manifest declared with `defineModule` of `@appweaver/common`,
naming the contracts it declares, the providers (drivers) implementing them, its services, models, routes and startup
code. The framework uses the same format for itself, so an application or an npm package can do everything a
first-party module does.

## First-party modules

| Module                  | Enabled                      | Brings                                                                                                            |
|-------------------------|------------------------------|-------------------------------------------------------------------------------------------------------------------|
| `@appweaver/core`       | Always                       | The contracts and the in-process drivers: `memory`, `node` events, `local` storage, `memory` queue, `json` mailer |
| `@appweaver/data`       | Installed                    | The `prisma` database, the resources, `FileService`, the `database` security store                                |
| `@appweaver/web`        | Installed (requires `data`)  | The Fastify server (`HttpServer`), authentication, account and OAuth2 services                                    |
| `@appweaver/redis`      | Installed                    | The `redis` memory, also the store of the cache and the rate limit                                                |
| `@appweaver/bullmq`     | Installed (requires `redis`) | The `bullmq` queue                                                                                                |
| `@appweaver/cron`       | Installed                    | The `cron` scheduler                                                                                              |
| `@appweaver/nodemailer` | Installed                    | The `smtp` mailer                                                                                                 |
| `@appweaver/handlebars` | Installed                    | The `handlebars` template engine                                                                                  |
| `@appweaver/sharp`      | Installed                    | The `sharp` image processor                                                                                       |

Every first-party module but core is a package of its own, enabled like any [package module](#package-modules): by
being a dependency of the application's `package.json`. A driver package carries the library it wraps as a dependency,
so `npm install @appweaver/redis` moves the memory, the cache and the rate limit to Redis without any config, and
installing `ioredis` alone enables nothing. The scaffold modules of `weaver module add` (`redis`, `queue`, `mailer`,
...) install these packages along with their config and files.

## Discovery

The enabled modules come from:

| Source         | Found                                                                                                                                                                                      |
|----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Core           | `@appweaver/core`, always                                                                                                                                                                  |
| Packages       | The `dependencies` and `optionalDependencies` of the project's `package.json` whose own `package.json` has `"appweaver": { "module": "./dist/module.js" }`, and the modules they `require` |
| Local modules  | Every manifest matching `APP_MODULES_PATTERN` (`app.modulesPattern`, default `<srcPath>/modules/*/module.ts`), without any config                                                          |
| Explicit paths | `APP_MODULES` (`app.modules`), manifest paths relative to the project root, i.e. `../shared/dist/module.js`                                                                                |

- `APP_MODULES_DISABLED` (`app.modulesDisabled`) leaves modules out by name, i.e. `["@appweaver/web"]` for a worker or
  a scheduled job runner without a server, which can also leave the package out of its dependencies.
- The local pattern resolves against the build output on Node (`./dist/src/modules/*/module.js`) and against the
  sources with Bun and in `weaver generate`. An empty pattern turns the scan off.
- Every module comes after the modules it `requires`, otherwise in the order above.
- The startup fails with a `ModuleError` for a file not exporting a manifest (`MODULE_INVALID`), two modules of one
  name (`MODULE_DUPLICATE`), a required module that is not enabled (`MODULE_MISSING`), or a `framework` range the
  version of `@appweaver/core` does not satisfy (`MODULE_INCOMPATIBLE`).

`isModuleEnabled(modules, name)` and `loadModuleParts(modules, part)` of `@appweaver/core` take the result of
`discoverModules`, for tooling that loads the modules itself.

## Load order

`createApp()` loads the enabled modules in this order:

1. The providers selected for every declared contract, then the `services` of every module whose `requires` are all
   provided.
2. The `setup` of every module, in the module order. `@appweaver/data` loads the resources of the application, then
   the `resources` of the modules. `@appweaver/web` loads the resource routes of the application
   (`RESOURCE_ROUTES_PATTERN`), then the `web` part of every module.
3. The `main` part of every module.
4. The application files (`APP_SCAN_FILES_PATTERN`).

The server of `@appweaver/web` is created by its `HttpServer` service once everything is loaded, and listens when the
application starts. The resources and the routes of the application and the modules are all loaded before the `main`
parts and the application files.

A provider or a service of a module is defined with the `override` mode of `define`. The application replaces one with
`define(MyService, ModuleService, 'override')`, since the default mode keeps the existing definition.

## Provider selection

Each contract a module declares has a config key (`storage.provider`, ...), which takes `auto` (the default), `none`, a
provider name or a module path (see [providers](./configuration.md#providers)):

- `auto` selects the providers whose `auto` is `true` (the default), or when there is none, the one whose `auto` is
  `'fallback'` (the in-process drivers of core). A provider with `auto: false` is selected only by its name (the `json`
  mailer, the `memory` security store). Two candidates fail with `MODULE_PROVIDER_AMBIGUOUS`.
- `none` defines nothing for the contract, and no service requiring it.
- A name selects the provider of that name of any enabled module, `MODULE_PROVIDER_MISSING` when none has it.
- A value with `.`, `/` or `@` is a module path, loaded with `loadProvider` (`@/infra/my-storage`).

The selected provider is defined under its contract, so `inject(Storage)` returns it. `selectedProvider(Storage)`
returns its name.

## Manifest

```ts
// module.ts
import { defineModule } from '@appweaver/common';

export default defineModule({ name: 'appweaver-newsletter' /* ... */ });
```

| Field       | Type                                     | Purpose                                                                                                                                            |
|-------------|------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| `name`      | `string`                                 | The name, the package name for a package module                                                                                                    |
| `framework` | `string`                                 | The supported Appweaver version range, i.e. `^2.0.0`, checked at startup                                                                           |
| `requires`  | `string[]`                               | The modules that must be enabled with it (`@appweaver/bullmq` requires `@appweaver/redis`)                                                         |
| `config`    | `object[]`                               | Its config sections, defined with `defineConfig`                                                                                                   |
| `contracts` | `{ contract, provider: () => string }[]` | The contracts it declares, with the function reading the provider key, i.e. `() => paymentConfig.PROVIDER`                                         |
| `providers` | `{ contract, name, load, auto? }[]`      | Its contract implementations. `load` imports the class lazily (`() => import('./gcs-storage')`), `auto` is `true`, `'fallback'` or `false`         |
| `services`  | `{ load, requires? }[]`                  | Classes defined at startup by their class name, with their lifecycle hooks and health checks; `requires` lists the contracts that must be provided |
| `setup`     | `(context) => unknown`                   | Run after the providers and services of every module, before the `main` parts and the application files (see below)                                |
| `resources` | `() => import(...)`                      | A file exporting its models, resource services and policies, loaded by the `setup` of `@appweaver/data`, and by `weaver generate`                  |
| `main`      | `() => import(...)`                      | Code run at startup: scheduled jobs, queue workers, event listeners                                                                                |
| `web`       | `() => import(...)`                      | Its resource routes, custom routes (`registerRoute`) and plugins (`registerPlugin`), loaded by the `setup` of `@appweaver/web`                     |
| `commands`  | `() => import(...)`                      | Its `weaver` subcommands                                                                                                                           |
| `seeders`   | `string`                                 | The absolute path of its seeders directory                                                                                                         |
| `locales`   | `string`                                 | The absolute path of its translations, overridden by the ones of the application                                                                   |
| `templates` | `string`                                 | The absolute path of its templates, overridden by the ones of the application                                                                      |

Every part is imported lazily and only when used: a driver only when it is selected, `web` only with a server. Keep
the routes in `web`, not in `resources`, so the module also works without a server.

`setup` receives `{ modules, scanPath, params }`: the enabled manifests in their load order, the source directory of
the application (`./dist/src`) and the parameters given to `createApp` (`resourcePaths`, `autoLoadResources`, ...).
It is how a module loads what it brings from the application or the other modules, the way `@appweaver/data` loads the
resources and `@appweaver/web` the routes:

```ts
export default defineModule({
  name: '@acme/appweaver-jobs',
  setup: async ({ modules, scanPath }) => (await import('./load-jobs')).loadJobs(modules, scanPath)
});
```

`isModule(value)` checks a manifest, and `PROVIDER_AUTO` / `PROVIDER_NONE` hold `'auto'` and `'none'`.

The `config`, `commands`, `seeders`, `locales` and `templates` fields are declared for the tooling, and not loaded by
the framework yet: a config section is registered when its file imports `defineConfig`, and only the seeders,
translations and templates of the application are read.

A module model relates to the application only through a reference resolved when the app loads, i.e. the auth model.

## Example: a Google Cloud Storage driver

A local module lives in `src/modules/<name>/`, compiled with the application and enabled without any config:

```
src/modules/gcs/
  module.ts        the manifest
  config.ts        its config section
  gcs-storage.ts   class GcsStorage extends Storage
```

```ts
// src/modules/gcs/config.ts
import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const gcsConfig = defineConfig('storage.gcs', {
  /** The bucket the files are stored in. */
  BUCKET: Type.String(),
  /** The validity of a signed URL in milliseconds, unless the caller gives one. Default: `900000` (15 min). */
  SIGNED_URL_TTL: Type.Integer({ default: 900_000 })
});
```

```ts
// src/modules/gcs/gcs-storage.ts
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Storage as GcsClient } from '@google-cloud/storage';
import { ContentStream, FileUrlOptions, HealthCheckResult, Storage, StoreOptions } from '@appweaver/common';
import { gcsConfig } from './config';

export class GcsStorage extends Storage {
  private readonly _bucket = new GcsClient().bucket(gcsConfig.BUCKET);

  async onInit(): Promise<void> {}

  async store(fileName: string, data: Readable, options?: StoreOptions): Promise<string | null> {
    await pipeline(data, this._bucket.file(fileName).createWriteStream({ contentType: options?.contentType }));
    return fileName;
  }

  async stream(fileName: string, start: number, end?: number): Promise<ContentStream | null> {
    const file = this._bucket.file(fileName);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [metadata] = await file.getMetadata();
    return { stream: file.createReadStream({ start, end }), size: Number(metadata.size) };
  }

  async delete(fileName: string): Promise<boolean> {
    await this._bucket.file(fileName).delete({ ignoreNotFound: true });
    return true;
  }

  async exists(fileName: string): Promise<boolean> {
    const [exists] = await this._bucket.file(fileName).exists();
    return exists;
  }

  // The files route redirects to the signed URL instead of streaming the file
  async url(fileName: string, options?: FileUrlOptions): Promise<string | null> {
    const ttl = options?.expiresIn ?? gcsConfig.SIGNED_URL_TTL;
    const [url] = await this._bucket.file(fileName).getSignedUrl({ action: 'read', expires: Date.now() + ttl });
    return url;
  }

  async checkHealth(): Promise<HealthCheckResult> {
    const [exists] = await this._bucket.exists();
    return { success: exists };
  }
}
```

```ts
// src/modules/gcs/module.ts
import { defineModule, Storage } from '@appweaver/common';
import { gcsConfig } from './config';

export default defineModule({
  name: 'gcs',
  config: [gcsConfig],
  providers: [{ contract: Storage, name: 'gcs', load: () => import('./gcs-storage') }]
});
```

With the module enabled, `STORAGE_PROVIDER=auto` selects `gcs` over the `local` fallback. Its config is read under the
section of its contract, and only when the driver is selected, so the tests can keep the `local` storage:

```json
{
  "config": {
    "storage": {
      "gcs": { "bucket": "app-files" }
    }
  },
  "environments": {
    "test": { "storage": { "provider": "local" } }
  }
}
```

The same values as environment variables: `STORAGE_PROVIDER=gcs`, `STORAGE_GCS_BUCKET=app-files`.

## Package modules

The `src/` directory of a package is what a local module is in `src/modules/<name>/`, so a local module that imports
nothing of the application through the `@/` aliases moves into a package unchanged:

```jsonc
// package.json
{
  "name": "@acme/appweaver-gcs",
  "keywords": ["appweaver-module"],
  "appweaver": { "module": "./dist/module.js" },
  "dependencies": { "@google-cloud/storage": "^7.0.0" },
  "peerDependencies": {
    "@appweaver/common": "^2.0.0",
    "@appweaver/core": "^2.0.0"
  }
}
```

```ts
// src/module.ts
export default defineModule({
  name: '@acme/appweaver-gcs', // the package name
  framework: '^2.0.0',
  config: [gcsConfig],
  providers: [{ contract: Storage, name: 'gcs', load: () => import('./gcs-storage') }]
});
```

- Name the package `appweaver-<name>` or `@scope/appweaver-<name>`, with the npm keyword `appweaver-module`.
- `@appweaver/common` and `@appweaver/core` are peer dependencies, never dependencies, so the application keeps one
  dependency injection context, as are `@appweaver/data` and `@appweaver/web` for a module importing their factories,
  services or routes.
- A module the package `requires` is a dependency of it (`@appweaver/bullmq` depends on `@appweaver/redis`), so
  installing the package brings and enables it, or a peer dependency the application installs too (`@appweaver/web`
  on `@appweaver/data`).
- The application enables the package by installing it as a dependency (not a dev dependency).
- A driver nests its config section under its contract (`storage.gcs`, like `mailer.smtp`), any other module takes its
  own top-level section. Two packages may define the same section path with their own keys (`healthCheck` in core and
  web, `security.oauth2` in data and web), but a flattened key belongs to one section only.
