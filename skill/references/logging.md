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

## Levels

The framework logs at these levels:

| Level   | Logged                                                                                                  |
|---------|---------------------------------------------------------------------------------------------------------|
| `fatal` | The process cannot go on, i.e. an uncaught exception                                                    |
| `error` | A failure needing attention: a 5xx response, a failed job, a lost connection                            |
| `warn`  | A degraded or unexpected state the application recovers from: a job retried, a slow query, a check down |
| `info`  | One-time, system-wide facts only: the application started and stopped, a connection made or restored    |
| `debug` | The internal behavior: every operation, i.e. a resource written, a job run, a login rejected, a 4xx     |
| `trace` | Not used by the framework                                                                               |

The framework never logs a request, a login or another operation at `info`. The requests are audited by the request
logs of the `server` logger (`SERVER_REQUEST_LOGGING_ENABLED`), and the operations are seen at `debug`.

The application is not bound by the levels of the framework and picks the level of its own logs: `info` for the core
behavior worth seeing in the production logs (a scheduled job publishing posts, an order paid, a worker done), `debug`
for the details only useful while investigating. A logger too noisy at `info` can still be quietened with its own level
in `LOG_LEVELS`.

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
- The `appweaver.schema.json` of `weaver generate` suggests the logger names the enabled modules list in the
  `loggerNames` of their manifests (the framework loggers below, and those of the module packages and local modules),
  and still accepts any other name, i.e. a logger of the application.
- The levels are read when the loggers are created, at startup, so a change needs a restart.
- The `weaver` CLI commands log nothing, whatever the levels.

### Framework loggers

| Name        | Logs of                                                                                                                      |
|-------------|------------------------------------------------------------------------------------------------------------------------------|
| `app`       | The started application and its duration (info), the enabled modules, providers, app files and lifecycle hook durations      |
| `database`  | The connection (info), slow queries (warn), Prisma events, transaction retries and rollbacks                                 |
| `resource`  | Resources created, updated and deleted, bulk operations, denied policies, the loaded models, services and routes, CSV export |
| `server`    | Fastify and its request logs, 5xx (error) and 4xx (debug) responses, rate limit hits, plugins, routes and shutdown           |
| `security`  | Logins and their rejection reason, rejected API keys, password, email and 2FA flows, OAuth2, reCAPTCHA and Turnstile         |
| `cache`     | Cache hits and misses, writes, invalidation, eviction, and the cache going away and coming back                              |
| `memory`    | The Redis connections: established and restored (info), lost (error)                                                         |
| `events`    | The listeners added and the events emitted, or deferred to the commit of a transaction                                       |
| `queue`     | Jobs added and completed with their duration, retried (warn), failed (error) and stalled (warn)                              |
| `scheduler` | Jobs added with their next run, started, stopped and removed, each run with its duration                                     |
| `mailer`    | E-mails queued and sent, the SMTP message id, and the e-mails of the `json` mailer                                           |
| `template`  | The loaded templates and the template preview route                                                                          |
| `locale`    | The loaded translations and the missing keys                                                                                 |
| `storage`   | `FileService`, the `local` storage driver and the processed images                                                           |
| `health`    | Each check going down (warn) and up again (info), once per change, and the health listener                                   |

### Database queries

`DATABASE_LOG_EVENTS` selects the events Prisma emits, so the queries need both the event and the level:

```bash
DATABASE_LOG_EVENTS=query,warn,error
LOG_LEVELS_DATABASE=debug
```

`DATABASE_SLOW_QUERY_THRESHOLD` logs every query taking at least that many milliseconds as a warning, with its SQL but
without its parameters, whatever `DATABASE_LOG_EVENTS` holds. It is `0` by default, which disables it:

```bash
DATABASE_SLOW_QUERY_THRESHOLD=3000
```

### Request logs

The request logs of Fastify are written by the `server` logger when `SERVER_REQUEST_LOGGING_ENABLED` is `true`, so
`LOG_LEVELS_SERVER=warn` keeps the errors of the server without them.

## Redacted values

The values of the keys `password`, `passwordHash`, `token`, `accessToken`, `refreshToken`, `apiKey` and `secret`, at the
top of a record or one level down, and the `authorization`, `cookie` and `x-api-key` headers of a request, are written
as `[Redacted]`. Still never log a credential under another key.

## Output

| Key            | Effect                                                                                    |
|----------------|-------------------------------------------------------------------------------------------|
| `LOG_PRETTY`   | Colored, human-readable lines (`[database] Prisma query`), for development                |
| `LOG_PATH`     | Also writes to `<LOG_PATH>/<app name>.log` (`APP_NAME` in snake case), rotated by default |
| `LOG_ROTATE_*` | The rotation of the file: its size, interval, total size, number of files and compression |
| `LOG_SYNC`     | Writes each record before the next statement runs, so none is lost or reordered (tests)   |

The samples and the scaffolded projects pretty-print at `debug` in the `dev` environment, and log nothing in `test`.

## Testing

Spy on the logger the code under test logs with, the named one when it uses `createLogger`:

```ts
import { createLogger } from '@appweaver/common';

const error = jest.spyOn(createLogger('billing'), 'error').mockImplementation();
// ...
expect(error).toHaveBeenCalledWith(expect.any(Error), 'Invoice failed');
```
