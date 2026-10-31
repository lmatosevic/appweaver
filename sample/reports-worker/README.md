# Reports Worker

> Appweaver sample - Reports worker aggregating a ledger on a schedule, without a server

A background worker with a database and no HTTP server: it keeps a ledger of transactions, builds a report of every
day after midnight, archives the transactions past their retention (their totals stay in the reports), imports bank
exports from CSV files, and prints reports from the command line.

Created with `npm create @appweaver reports-worker -- --add scheduler docker --exclude web`, so it has the default
`@appweaver/data`, and `@appweaver/cron`, but not the default `@appweaver/web`.

## What it showcases

| Feature                                                                                | Where                                                                                  |
|----------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| An application with a database and no server: resources without routes                 | [`resources/`](src/resources/transaction/model.ts)                                     |
| A worker kept running by its cron jobs, the scheduled report and archive jobs          | [`features/reports/report-jobs.ts`](src/features/reports/report-jobs.ts)               |
| The health listener of an app without a server (`healthCheck.port`), the Docker check  | [`appweaver.json`](appweaver.json), [`docker-compose.yml`](docker-compose.yml)         |
| Idempotent upserts by a unique key (one report per day), rebuilt for late transactions | [`features/reports/daily-report.ts`](src/features/reports/daily-report.ts)             |
| A JSON column holding the net amount of every category                                 | [`resources/daily-report/model.ts`](src/resources/daily-report/model.ts)               |
| One-shot tasks with arguments: a CSV import and a report printed as a table            | [`tasks/`](src/tasks/report.ts)                                                        |
| Imports deduplicated by the reference of the source system                             | [`features/import/import-transactions.ts`](src/features/import/import-transactions.ts) |
| A seeder generating a reproducible ledger, and its reports                             | [`database/seeders/`](database/seeders/001-create-transactions.ts)                     |
| Amounts stored in cents, totals calculated without floating point errors               | [`features/reports/summary.ts`](src/features/reports/summary.ts)                       |

## Getting started

Build the monorepo once from the repository root (`npm install && npm run build`), then in this directory:

```bash
cp .env.example .env   # NODE_ENV=dev
npm run migrate        # create the SQLite database in data/
npm run seed           # the last 45 days of a household ledger, and their reports
npm run dev            # the worker, its health listener on http://localhost:5006/health/check
```

`docker compose up` runs the migrations, the seeder and the worker in containers, the SQLite database in a named
volume, and checks the worker's health on its listener.

## Try it out

```bash
# The reports of the last 7 days, and their totals by category
npx weaver run src/tasks/report.ts

# A period of your choice, building the reports it misses
npx weaver run src/tasks/report.ts 2026-10-01 2026-10-31

# Import a bank export: run it twice, the second run skips every reference it imported
npx weaver run src/tasks/import.ts fixtures/transactions.csv
npx weaver run src/tasks/report.ts 2026-10-01 2026-10-04

# The health of the running worker: the database, memory, storage and queue
curl -s localhost:5006/health/check | jq
```

The daily job runs at 00:05 UTC. On Node, `weaver run` runs the build output of a task, so run `npm run build` after a
change (`npm run dev` rebuilds on every change).

## Tests

```bash
npm run test  # unit tests of the totals, the dates and the CSV parsing
npm run e2e   # the reports, the import, the archive and the report task, against a temporary SQLite database
```

## License

UNLICENSED
