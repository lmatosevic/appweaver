# Load tests of the samples

The load-test harness of `PLAN-v3.md` (V3-PERF-01, V3-PERF-02): the scenarios of every sample on its own database,
the numbers each phase of v3 is compared to. It is run by hand, never by the CI of a pull request.

```bash
npm run build                                           # the samples run on the built packages
npm run load -- cms-api --build --setup --size 100k     # build, migrate and seed the sample, then load it
npm run load -- cms-api --size 100k --connections 1,20  # once set up: the latency alone, then 20 connections
npm run load -- webshop-api --setup --teardown          # starts and stops its Docker Compose services
npm run load -- --all --setup --teardown --size 10k     # every sample, one after another
npm run load:probe -- cms-api --idle 60 --soak 120      # idle wake-ups and memory, heap growth over a soak
npm run load:summary                                    # the latest reports as the Markdown tables of PLAN-v3.md
```

## What a run does

1. `--build`: `weaver build` in the sample (the Node samples load `dist/src`).
2. `--setup`: copies `.env.example` to `.env` when the sample has none, starts the Docker Compose `services` of its
   definition (`docker compose up -d --wait`), then `weaver migrate` and `weaver seed` with the admin password
   `LOAD_ADMIN_PASSWORD` (default `Load-test-password-1`), so the scenarios can sign in.
3. Seeding (unless `--no-seed`): `weaver run tools/load/seed-task.js <sample> <rows>` in the sample, which inserts
   through the Prisma client of the application, so it works on every database. It tops the main model up to
   `--size` rows (`10k`, `100k`, `1m`) and does nothing once the model holds that many, so a run at 100k after one at
   10k inserts the missing 90k.
4. Starts the application with `NODE_ENV=prod` and the `env` of its definition (`node dist/src/main.js`, or
   `bun src/main.ts` for a Bun sample) and waits for `/health/ready`. With `--no-start` it loads an application
   already running on the port of the definition.
5. Signs in (`auth`), runs `prepare`, then every scenario with autocannon for each `--connections` count, for
   `--duration` seconds each.
6. Writes `reports/load/<sample>-<size>-<date>.json` and prints the results as a Markdown table. `--teardown` stops
   the Docker Compose services afterwards, so the next sample can publish the same ports.

Run the samples one at a time: several share the ports of PostgreSQL and Redis.

## A sample definition

`tools/load/samples/<sample>.js`, named after the directory of the sample:

| Key         | Content                                                                                                     |
|-------------|-------------------------------------------------------------------------------------------------------------|
| `database`  | The `DatabaseType` the sample runs on, written to the report                                                |
| `services`  | The Docker Compose services `--setup` starts                                                                |
| `port`      | The port the application listens on (its health listener for a worker)                                     |
| `auth`      | `basic` or `login` as the seeded admin, `{ type, username, password }` for another user, or `none`         |
| `env`       | Environment variables of the application under load, i.e. `RATE_LIMIT_ENABLED: 'false'`                    |
| `seed`      | `model` (the Prisma delegate), `prepare(helpers)` (the IDs the rows refer to), `row({ index, runId, refs, random })`, and `after({ insertedIds, rows, link, ... })` for the implicit many-to-many tables |
| `prepare`   | `async (api) => context`: the IDs the scenarios pick from, read through the API                             |
| `scenarios` | `{ name, description, method, path, body, auth }`, `path` and `body` being values or functions of the context, called for every request |

`lib/scenarios.js` builds the standard scenarios of a resource (`find`, `query` with and without the count, a deep
page, a filter with a sort, the text search, a relation filter, the cached query, a one-year aggregate), each request
carrying a random value so the response cache never answers, except in `query-cached`.

## The probe

`npm run load:probe -- <sample>` starts the application with a preload (`lib/probe-preload.js`) that counts the timer
callbacks by the code that created each timer, and reports:

- the time to readiness, the RSS and heap after startup and after the idle window (after a forced GC);
- the timer wake-ups of `--idle` seconds of idle, by origin (the measure of E5);
- with `--soak <seconds>`, the scenarios run in turn between two heap snapshots, and the 25 largest growths by
  constructor (`lib/heap-diff.js`); `--keep-snapshots` keeps the `.heapsnapshot` files for the DevTools.

The probe runs on Node only: Bun implements neither `async_hooks.createHook` nor the IPC with a Node parent.
`loan-calculator` has neither a server nor a database and is not part of either tool.
