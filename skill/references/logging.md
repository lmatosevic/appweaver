# Logging

Appweaver logs with [pino](https://getpino.io), as JSON records on the standard output, and in a rotated file with
`LOG_PATH`. The config keys are listed in [configuration.md](./configuration.md#logging-log_).

## Loggers

`@appweaver/common` exports two kinds of logger:

- `logger` — the default logger, logging at `LOG_LEVEL` (`log.level`)
- `createLogger(name)` — a named logger, logging at its level of `LOG_LEVELS` (`log.levels.<name>`), otherwise at
  `LOG_LEVEL`. Its records carry the name in their `module` field. The same name returns the same logger.

```ts
import { createLogger, logger } from '@appweaver/common';

// Named after the module or feature logging with it, in camelCase
const log = createLogger('billing');

log.debug({ invoiceId }, 'Invoice sent');
log.error(err, 'Invoice failed');
logger.info('Logged at LOG_LEVEL, without a name');
```

Prefer a named logger in a module, a service or a job, so its level can be set apart from the rest. A module package
logs under its short name (`@acme/appweaver-gcs` → `gcs`), and a local module under the camelCase of its name
(`audit-log` → `auditLog`), as the files scaffolded by `weaver module new` and `npm create @appweaver module` do.

## Log levels per module

`LOG_LEVELS` sets the level of a name, any other logger logs at `LOG_LEVEL`, and `silent` turns a logger off. A named
level overrides the default either way, so `LOG_LEVEL=silent` with `database: debug` prints the database logs only.

```jsonc
// appweaver.json
"log": {
  "level": "info",
  "levels": { "database": "trace", "cache": "error", "scheduler": "silent" }
}
```

```bash
# Each entry is its own variable, or a name:level pair of the LOG_LEVELS list
LOG_LEVELS_DATABASE=trace
LOG_LEVELS=database:trace,cache:error
```

- An entry of the environment overrides the same entry of the JSON files, and keeps the other ones.
- A name of `LOG_LEVELS` no logger uses (a typo, or a disabled module) is reported with a warning when the application
  is created.
- The levels are read when the loggers are created, at startup, so a change needs a restart.
- The `weaver` CLI commands log nothing, whatever the levels.

### Framework loggers

| Name        | Logs of                                                                                     |
|-------------|---------------------------------------------------------------------------------------------|
| `app`       | Module discovery, provider loading, the application lifecycle, dependency injection         |
| `database`  | Prisma (the `DATABASE_LOG_EVENTS` events, a query at `debug`) and the transactions          |
| `resource`  | Resource and route loading, the services, policies and models, the CSV export               |
| `server`    | Fastify, the request logs (`SERVER_REQUEST_LOGGING_ENABLED`), the plugins and error handler |
| `security`  | Authentication, JWT, OAuth2, reCAPTCHA and Turnstile                                        |
| `cache`     | `Cache` and `CacheService`                                                                  |
| `memory`    | The Redis memory driver                                                                     |
| `events`    | The `node` events driver                                                                    |
| `queue`     | The `memory` and `bullmq` queue drivers                                                     |
| `scheduler` | The `cron` scheduler                                                                        |
| `mailer`    | `EmailService` and the `json` mailer                                                        |
| `template`  | The Handlebars engine and the template preview route                                        |
| `locale`    | `LocaleService`                                                                             |
| `storage`   | The `local` storage driver and `FileService`                                                |
| `health`    | `HealthService` and the health listener                                                     |

### Database queries

`DATABASE_LOG_EVENTS` selects the events Prisma emits, so the queries need both the event and the level:

```bash
DATABASE_LOG_EVENTS=query,warn,error
LOG_LEVELS_DATABASE=debug
```

### Request logs

The request logs of Fastify are written by the `server` logger when `SERVER_REQUEST_LOGGING_ENABLED` is `true`, so
`LOG_LEVELS_SERVER=warn` keeps the errors of the server without them.

## Output

| Key               | Effect                                                                                       |
|-------------------|----------------------------------------------------------------------------------------------|
| `LOG_PRETTY`      | Colored, human-readable lines (`[database] Prisma query`), for development                   |
| `LOG_PATH`        | Also writes to `<LOG_PATH>/<app name>.log` (`APP_NAME` in snake case), rotated by default    |
| `LOG_ROTATE_*`    | The rotation of the file: its size, interval, total size, number of files and compression    |
| `LOG_SYNC`        | Writes each record before the next statement runs, so none is lost or reordered (tests)      |

The samples and the scaffolded projects pretty-print at `debug` in the `dev` environment, and log nothing in `test`.

## Testing

Spy on the logger the code under test logs with, the named one when it uses `createLogger`:

```ts
import { createLogger } from '@appweaver/common';

const error = jest.spyOn(createLogger('billing'), 'error').mockImplementation();
// ...
expect(error).toHaveBeenCalledWith(expect.any(Error), 'Invoice failed');
```
