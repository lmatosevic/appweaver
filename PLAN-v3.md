# Appweaver v3.0.0 Plan

> **Status**: draft for review, refined phase by phase. **Baseline**: v2.10.0 (`main` at `f26fc6b`), the measurements of
> section 3. **Released since**: v2.10.1 (`main` at `b57cfe1`), phase 1a.
> **Revision 18**: a clean switch: no aliases or compatibility code for the renamed keys, model options, routes and
> codes; the old names stop working in v3, `MIGRATION-v3.md` lists them (D23).
> **Revision 17**: every duration key accepts milliseconds or a unit string in v3, the former seconds keys included; no
> compatibility mode for them (D11).
> **Revision 16**: audit fields stay in the responses by default, removable per model, view or relation (D5, F10).
> **Revision 15**: `weaver upgrade` stays a version and skill updater; it never rewrites the code or the config of a
> project. The migration is the user's, guided by `MIGRATION-v3.md` and the warnings at startup.
> **Revision 14**: no prerelease channel: one pull request per phase into `main`, stacked on the previous phase; 3.0.0 is
> released from `main` once every phase is merged; a 2.x fix, if ever needed, branches from the `v2.10.1` tag (section 2).
> **Revision 13**: the maintainer's decisions of section 9 recorded: no 2.x maintenance after 3.0.0, the defaults of D5
> (Swagger stays on, configurable), the release held for TypeScript 7.1, every sample and both clients kept, `views`, the
> `DatabaseType` suffixes of the SQL files.
> **Revision 12**: phase 1a released in 2.10.1 (decision 7 closed).
> **Revision 11**: response compression, configurable globally and per route (E15, D24, V3-WEB-04).
> **Revision 10**: the spatial model key is `spatial` (decision 10 closed, D23).
> **Revision 9**: full names instead of the framework's own abbreviations (`geo`, `2fa`, `OTT`, ...), D23, V3-CONV-08.
> **Revision 8**: remembered 2FA devices added to phase 4, next to the forced 2FA lifecycle (D6b, V3-WEB-03).
> **Revision 7**: no Prisma 8 plans: v3 keeps Prisma 7 exactly as it is used today, with no switch planned and no code
> preparing one; the migration engine interface, the `weaver db` restructuring and the Prisma 8 backlog are removed
> (D16). The custom SQL migration layer (D22) stays. Only TypeScript runs on a pre-release (7.1 beta) in development.
> **Revision 6**: v3 stays on Prisma 7.x; Prisma 8 in a 3.x minor (superseded by 7).
> **Revision 5**: custom SQL migrations investigated (E14, D22); Prisma 8 has no SQL Server library, so D16 is re-opened
> (section 9).
> **Revision 4**: phase 1a done on `fix/security-and-query-limits` (section 6); v3 is built on the TypeScript 7.1 beta and
> the Prisma 8 release candidates for development, and released only once both are stable (Prisma part superseded by 6).
> **Revision 3**: v3 waits for TypeScript 7.1 and Prisma 8.0.0 stable before its toolchain phase (superseded by 4).
> **Revision 2**: every claim below was checked in the code or measured (section 3). Each decision of section 5 states
> the evidence it rests on, the alternatives rejected, and what it breaks. Nothing is implemented before its phase plan
> is reviewed and its change requests are approved.

## Contents

1. [Goals and principles](#1-goals-and-principles)
2. [Process](#2-process)
3. [Evidence: experiments run for this plan](#3-evidence-experiments-run-for-this-plan)
4. [Findings register](#4-findings-register)
5. [Decisions](#5-decisions)
6. [Phases and stages](#6-phases-and-stages)
7. [Module-by-module plan](#7-module-by-module-plan)
8. [Change request register](#8-change-request-register)
9. [Decisions left to the maintainer](#9-decisions-left-to-the-maintainer)
10. [Release plan](#10-release-plan)

---

## 1. Goals and principles

**Goals**

- **Sanity check** every package, feature, interface and use case: does it make sense, is it complete, is it needed.
- **Consistency**: one way to do each thing (exposure, projection, extension, units, config, naming).
- **Performance**: fast on realistic data (10k to 100k records), cheap when idle, no memory growth.
- **Security**: secure by default, every module reviewed.
- **AI agent workflow**: fewer tokens, fewer steps and fewer wrong turns for an agent building an application.

**Principles**

- **Brutal honesty**: every proposal states its cost, its risk and the "leave it as is" option. A change has to beat
  doing nothing. Section 5 rejects several ideas of the original task list, with the reason.
- **Remove and simplify first**: adding an option needs a use case from a sample or a real application.
- **Breaking changes are allowed, as a clean switch** (revision 18): no aliases, deprecated options or compatibility code
  for the renamed or changed parts; the old names stop working in v3, and each change gets a migration note in
  `MIGRATION-v3.md`. `weaver upgrade` never rewrites a project (revision 15): it bumps the Appweaver packages, their
  companions and the skill files, nothing else; the migration is the user's to make.
- **Measure before optimizing**: the numbers of section 3 are the v2.10.0 baseline every later change is compared to.
- **Small steps**: one concern per change request (CR), reviewed and merged one at a time.
- **2.x is not maintained**: v3 replaces it as the latest release. Phase 1a shipped as 2.10.1; a 2.x fix, if one is ever
  needed, is a branch from the `v2.10.1` tag, published on its own.

---

## 2. Process

Every phase runs in three stages, each ending with a review:

1. **Phase plan**: the phase is detailed in this file, its CRs listed with their evidence. Each CR is approved,
   rejected or deferred by the maintainer.
2. **Implementation**: one branch and pull request per phase, stacked (below), one conventional commit per CR inside it
   (`feat!:` or a `BREAKING CHANGE` footer when breaking), so each CR reviews on its own and the phase merges at once.
3. **Phase review**: tests, lint, circular check and the load-test baseline rerun; skill, docs and migration guide
   updated; the phase is closed.

**Change request format**

| Field      | Content                                                                    |
|------------|----------------------------------------------------------------------------|
| ID         | `V3-<AREA>-<nn>`, e.g. `V3-DATA-03`                                        |
| Problem    | What is wrong or missing, with the evidence (section 3 or `file:line`)     |
| Proposal   | The change, and the alternatives considered                                |
| Do nothing | What happens if we skip it                                                 |
| Breaking   | Yes or no, who is affected, the migration step                             |
| Priority   | P0 (security or data loss), P1 (v3 scope), P2 (nice to have)              |
| Effort     | S (< 1 day), M (days), L (a week), XL (more)                               |
| Status     | `proposed`, `approved`, `rejected`, `deferred`, `in progress` or `done`    |

**Definition of done** of a CR: branch coverage kept at 80% or more (today 89%), `format:check`, `lint` and
`check:circular` passing, `skill/` updated, config examples updated (`appweaver.example.json`, `.env.example`,
`configuration.md`), samples and scaffold templates updated, a note in `MIGRATION-v3.md` when breaking, the load-test
scenarios it touches rerun, docs.appweaver.co updated.

**Branches, pull requests and releases** (revision 14):

- **No prerelease channel**: the v3 work is merged into `main` directly; `release.config.js` is unchanged
  (`branches: ['main']`).
- **One pull request per phase, stacked**: the branch of a phase starts from the branch of the previous phase, and its
  pull request targets it, so each pull request shows only the changes of its phase:

  ```
  main
   └─ v3/phase-0-preparation         PR → main
       └─ v3/phase-1-review           PR → v3/phase-0-preparation
           └─ v3/phase-2-toolchain     PR → v3/phase-1-review
               └─ ...                  up to v3/phase-7-docs
  ```

  When a phase merges into `main`, the next pull request is retargeted to `main` and its branch rebased onto it; a
  change asked in the review of an earlier phase is made on its branch and the later branches are rebased.
- **Releasing**: the Release workflow is run by hand, so `main` holds the merged phases unreleased; it is run once,
  after the last phase and with TypeScript 7.1 stable (section 10), and the `feat!` commits make it 3.0.0. No release is
  run between two phases.
- **2.x**: not maintained (decision 1). If a fix is ever needed, a branch from the `v2.10.1` tag, released on its own
  (added to the `branches` of `release.config.js` as a maintenance branch for that release only).

---

## 3. Evidence: experiments run for this plan

**Environment**: 4 vCPU, 15 GB RAM, Node 24.22.3, npm 12.2.3, the `cms-api` sample built and started with
`NODE_ENV=prod` on SQLite (`@prisma/adapter-better-sqlite3`) and a local Redis 7, the rate limiter off
(`RATE_LIMIT_ENABLED=false`, it answers `429` after 1,000 requests a minute otherwise). Load generated with autocannon 8,
20 connections for 10 s per scenario unless noted. The posts were inserted with a seeder writing directly into SQLite
(10k, then 100k posts, two tags each, ISO dates like Prisma writes them). The scripts become the harness of `V3-PERF-01`.

### E1. Build and test baseline

| Measure                                  | Result                                                    |
|------------------------------------------|-----------------------------------------------------------|
| `npm ci`                                 | 34 s                                                      |
| `npm run build` (TypeScript 5.9.3)       | 15 s, of which `tsc -b packages` 13.6 s                   |
| `npm test` (Jest 30 + SWC, coverage)     | 60 s; 312 suites, 4,872 tests (5 skipped), all passing    |
| `jest` without coverage                  | 33 s                                                      |
| Coverage                                 | 93.1% statements, 89.0% branches                          |
| `tsc --noEmit` of the whole repository   | 11.8 s                                                    |

### E2. Load test of the `cms-api` posts at 10k and 100k records

Every request carries a random value in its filter (`title: { _ne: <random> }`), so the response cache of the public
routes never answers, except in `queryCached`. `find` reads a random post.

**100k posts, one connection (the latency of a single request)**

| Scenario                                    | Req/s | p50     | p97.5  |
|---------------------------------------------|-------|---------|--------|
| `find` by ID                                | 188   | 4 ms    | 10 ms  |
| `query`, first page, with the total count   | 15    | 64 ms   | 112 ms |
| `query`, first page, `totalCount: false`    | 175   | 4 ms    | 12 ms  |
| `query`, random deep page (offset)          | 6     | 176 ms  | 264 ms |
| `query`, `status` + `category`, `-publishedAt` | 23 | 41 ms   | 53 ms  |
| `query`, `searchText` (`contains` on 3 text columns) | 2 | 448 ms | 536 ms |
| `query`, `tags: { _some: { id } }`          | 9     | 106 ms  | 137 ms |
| `query`, cached                             | 1,003 | 0 ms    | 1 ms   |
| `aggregate`, one year (13 periods)          | 2     | 380 ms  | 485 ms |

**20 connections**

| Scenario                     | 10k: req/s, p50, p99   | 100k: req/s, p50, p99           |
|------------------------------|------------------------|---------------------------------|
| `find`                       | 299, 59 ms, 147 ms     | 281, 64 ms, 129 ms              |
| `query` with the count       | 97, 190 ms, 424 ms     | 14, 1,119 ms, 3,983 ms          |
| `query` without the count    | 277, 64 ms, 137 ms     | 211, 66 ms, 153 ms              |
| Deep page                    | 69, 274 ms, 614 ms     | 6, 2,692 ms, 9,847 ms           |
| Filter and sort              | 159, 117 ms, 248 ms    | 23, 611 ms, 2,277 ms            |
| Text search                  | 31, 591 ms, 1,671 ms   | 2, 4,169 ms, 10 timeouts        |
| Relation filter              | 71, 264 ms, 559 ms     | 0, 16 timeouts (> 10 s)         |
| Cached                       | 1,719, 7 ms, 41 ms     | 10, 1,083 ms (see below)        |
| `aggregate`, one year        | n/a                    | 2, 4,886 ms, 9 timeouts         |

**What it shows**

- **The total count is the cost of a query**: 4 ms without it, 64 ms with it at 100k, 16 times more. It is on by
  default (`totalCount = true`, `data/resource/resource-service.ts:244`).
- **SQLite blocks the server**: better-sqlite3 runs every statement synchronously on the event loop, so throughput does
  not grow with connections (15 req/s at 1 and 14 at 20), and one slow query stalls every other request. The cached
  scenario fell from 1,719 to 10 req/s at 100k because the abandoned text-search and relation-filter queries kept
  running server-side after the clients timed out: there is no server-side query timeout.
- **Offset pagination degrades linearly** (176 ms for a deep page), cursors exist but are not the default.
- **`contains` text search scans** (448 ms), and the relation filter on a many-to-many relation costs 106 ms.
- **`aggregate` runs one query per period** (`data/resource/resource-service.ts:535`, `Promise.all` over the ranges),
  so a daily aggregate over a year is ~365 queries plus the `first`/`last` ones. Without `from` and `to` it silently
  covers the **last 7 days only**: the first run returned a `total` of 3 posts out of 100k.
- **The sample writes on every read**: the `afterFind` hook of `cms-api` (`sample/cms-api/src/resources/post/service.ts`)
  increments `viewCount` with a direct update; 9,216 of the 100k posts were rewritten by the `find` load test, every
  uncached read became a write, and the 60 s route cache makes the count wrong anyway.

### E3. CPU profile of the query path (10k posts, `query` with and without the count)

| Share of the samples | Where                                                                                  |
|----------------------|----------------------------------------------------------------------------------------|
| 33%                  | SQLite I/O (`performIO` of the adapter 26.8%, `prepare` 4.8%, better-sqlite3)          |
| 17%                  | Idle                                                                                   |
| 10.6%                | `@prisma/client` (the query compiler and interpreter)                                  |
| ~11%                 | Appweaver: `data` 5.7%, `common` 2.8%, `web` 1.6%, `core` 1.0%                          |
| ~6%                  | `projectVirtualFields` alone (`data/utils/virtual-util.ts:21`), re-resolving the schema properties of every key of every record with `extractSchemaProperties`, recursively; ~8% with `hideDeletedRelations` and `projectResource` |
| ~3%                  | `flatted.stringify` in `RedisMemory.set`, serializing every cached response, although the payload is already a string |
| ~3%                  | `fast-json-stringify`, Ajv compilation at startup                                       |

The framework itself is not the bottleneck on SQLite (the database is), but the projection is the largest framework
cost, and it is avoidable: the projection plan of a model can be compiled once.

### E4. Audit log overhead (`cms-api`, which also audits the reads; 10 connections, 8 s, 100k posts)

| Scenario       | Audit off: req/s, p99 | Audit on: req/s, p99 | Difference            |
|----------------|-----------------------|----------------------|-----------------------|
| `find`         | 299, 60 ms            | 240, 108 ms          | -20% throughput, p99 x1.8 |
| `query`        | 362, 51 ms            | 250, 90 ms           | -31% throughput, p99 x1.8 |
| `create`       | 251, 66 ms            | 204, 118 ms          | -19% throughput, p99 x1.8 |

The hooks of `web/audit/audit-hooks.ts` cost ~3% of the CPU; the rest is the batched inserts of the flush, which on
SQLite run synchronously on the event loop and show as p99 spikes. A second profiled run gave 295 req/s for `query`
with the audit on, so the variance is high; the real target is measured on PostgreSQL in phase 6.

### E5. Idle cost and memory

| Measure                                        | Result                                                     |
|------------------------------------------------|------------------------------------------------------------|
| RSS after startup                              | 443 MB                                                     |
| Heap used / total after startup                | 119 MB / 289 MB                                            |
| Heap and RSS of the packages alone (`require`) | 32 MB / 120 MB (`@appweaver/common` takes 285 ms to load)   |
| RSS under load                                 | ~990 MB, flat over three consecutive runs (high-water mark, no leak) |
| Timer wake-ups in 60 s of idle                 | 60 from the audit flush (`data/audit/audit-service.ts:111`, every second), 8 BullMQ lock extender, 2 BullMQ worker, 1 cron |

So ~87 MB of the idle heap is built at setup (the TypeBox module of every model, the Ajv validators and
fast-json-stringify serializers of every route, the OpenAPI document, the Prisma client). To be broken down with a heap
snapshot in phase 6.

### E6. TypeScript 6 and 7

| Run                                          | Result                                                                          |
|----------------------------------------------|---------------------------------------------------------------------------------|
| TypeScript 6.0.3, `tsc --noEmit`             | 1 error: `baseUrl` is deprecated (TS5101)                                       |
| TypeScript 7.0.2, `tsc --noEmit`             | 3.3 s (TS 5.9: 11.8 s), after 3 config changes: remove `baseUrl`, list `types` explicitly (`["node", "jest", "bun"]`), set `typeRoots`; then 2 errors |
| TypeScript 7.0.2, `tsc -b packages`          | 2.9 s (TS 5.9: 13.6 s, x4.7), the same errors plus `moduleResolution: node10` removed (`packages/client/tsconfig.cjs.json`) |
| The 2 errors                                 | `openapi-typescript` has no `astToString` (it needs the compiler API), `WebSocket.send` typing in `client/clients/modules/realtime-client.ts:722` |
| `require('typescript')` of 7.0.2             | exports only `version`, `versionMajorMinor` and `unstable/*`: **no compiler API** |
| `noImplicitAny: true` (currently `false`)    | 108 errors in the sources (data 67, common 13, client 13, web 11, core 2, redis 1, ai 1), 11 in tests |

Consequence: with TypeScript 7 as the `typescript` package, these break: `ts-node` (`cli/utils/loader-util.ts:5`,
which `weaver generate` uses to load the models), `@sinclair/typebox-codegen` (`cli/generate/generate-types.ts`), the
client generator (`openapi-typescript` and the TypeScript AST in `client/generators` and `client/utils`),
typescript-eslint 8.74 (`typescript >=4.8.4 <6.1.0`, or the 7.1 beta through `@typescript/native`) and madge.

### E7. Vitest instead of Jest

| Run                                                  | Result                                                         |
|------------------------------------------------------|----------------------------------------------------------------|
| Usage of Jest APIs in tests                          | `jest.fn` 447, `jest.spyOn` 151, `jest.mock` 72, `jest.requireActual` 55, `jest.resetModules` 34, `jest.isolateModules` 4 |
| Vitest 5.1.1, `core` only, `globalThis.jest = vi`    | 567 / 570 pass; 7.4 s isolated (Jest: 4.0 s), 2.4 s with `isolate: false` |
| The 3 failures                                       | the framework `require()`s provider and module files at runtime (`common/utils/module-util.ts`), which Vitest does not transform |
| Whole suite                                          | 45 to 47 of 312 files fail (`jest.isolateModules`, `process.chdir` unsupported in worker threads, runtime `require` of `.ts`, mock differences); 126 s isolated, 73 s not isolated, against **33 s for Jest** |
| Incident                                             | tests relying on `process.chdir()` into a temporary project (`cli` module and upgrade tests) ran a real `npm install` **in the repository root** under Vitest, changing `package.json` and the lockfile (restored) |

### E8. Generated client (`sample/movies-api-bun/client/generated/movies-client.ts`, 7,425 lines)

| Part                                             | Lines  | Share |
|--------------------------------------------------|--------|-------|
| `paths` (from `openapi-typescript`)              | 3,117  | 42%   |
| Exported aliases (`GenreQueryFilter`, `GenreSingle`, ... 136 types) | 3,372 | 45% |
| `components`                                     | 753    | 10%   |
| The client class and helpers                     | 169    | 2%    |
| Of all of it, doc comment lines                  | 2,156  | 29%   |

`genre` (no files, no series) lists 13 omitted operations, `writeSeries` and `uploadFiles` among them
(`client/generators/generate-client.ts:171`), where its 6 used ones would be shorter, and the inapplicable ones should
not be listed at all.

### E9. An application model named like a framework model

A test defined an application `Seeder` model with an extra field, then loaded the framework `Seeder` model like
`loadResources` does. Result: the context keeps the **application** model (`define` keeps the first definition,
`core/context/dependency-injection.ts:72`), but the loader's map keeps the **framework** one (the last export wins,
`data/resource/resource-loader.ts` `loadModels`), so the relinking, the validations and the `Type.Module` import are
applied to the framework model, while the application model in the context keeps its raw schemas. No error, no warning.

### E10. The response cache replays the headers of another request

With `CORS_ORIGIN=https://a.example,https://b.example`, the same cached query requested from `https://b.example`
answered `Access-Control-Allow-Origin: https://a.example`: `web/cache/caching.ts` stores `reply.getHeaders()` and
replays them, so the CORS check of the second origin fails in the browser. Any per-request header would be replayed the
same way. Also: `CORS_ORIGIN='["https://a.example","https://b.example"]'` (a JSON array) is silently taken as one
origin string, and CORS stopped matching at all.

### E11. Security probes (anonymous requests to the running sample)

| Probe                                                                                     | Result                                       |
|-------------------------------------------------------------------------------------------|----------------------------------------------|
| `POST /api/posts/query` with no credentials                                               | returns `Draft` posts with their `content`: the public routes of the reference sample have no read restriction |
| The same response                                                                         | carries `createdById` and the `updatedAt`, `createdAt` and `createdById` of the author |
| Filter `author.passwordHash` (a `hidden` field)                                           | rejected (`VALIDATION_FAILED`), correct      |
| Filter `author.email _like 'admin@%'`, a field the relation `output.omit`s                | 103,666 results; `'nobody@%'` gives 0: **the omitted email is an oracle**, guessable character by character |
| One 7.9 MB body: `filter._or` with 300k conditions (the body limit is `100M`)             | the **whole server froze for 19.5 s** (other requests waited 19.5 s), then answered `500 DATABASE_OPERATION_FAILED` |
| Code review                                                                               | `security.allowedRedirectHosts` defaults to `['*']` (open redirect, `web/security/security-config.ts:22`); JWT keys are generated per instance when missing, in every environment (`AUTO_GENERATE_KEYS: true`), so instances without a shared volume reject each other's tokens and every redeploy logs everyone out; Swagger UI on by default in production; CSV export without formula escaping (`data/utils/export-util.ts`); the `ApiKey` policy dereferences `user!` (`data/security/resources/api-key/policy.ts`) |

### E12. Ecosystem status (npm registry and specifications, 2026-11-24)

| Item                      | Status                                                                                                      |
|---------------------------|-------------------------------------------------------------------------------------------------------------|
| TypeScript                | `latest` 7.0.2 (2026-07-08), 6.0.3 (2026-04-16), `beta` 7.1.0-beta                                          |
| Prisma                    | **8.0.0-rc.35** carries the `latest` tag of `prisma` (2026-11-23), `@prisma/client` `latest` is 7.10.1. GA was expected in October 2026 and slipped. Needs Node 22.18+ and TypeScript 5.9+; `.take`/`.skip` become `.limit`/`.offset`, the legacy `@db.*` attributes are removed, the date types change, each RC ships an upgrade recipe. Our surface: 5 `take`/`skip`, 9 `@db.*` in the schema generator, 29 raw SQL calls, 5 Prisma error codes |
| Vitest                    | 5.1.1                                                                                                       |
| TypeBox                   | `typebox` 1.4.7; **the repository holds two copies**: `typebox@1.3.0`, pulled by `@fastify/type-provider-typebox` 6.x (peer `typebox ^1.1.14`), and `@sinclair/typebox@0.34.49`, which builds every schema of the framework |
| ESLint                    | 10.15.0 (`typescript-eslint` 8.74 supports it)                                                              |
| Fastify                   | 5.12.8, 6.0.0-alpha.6                                                                                       |
| MCP                       | **2026-07-28** is the current specification: stateless core, no `initialize` handshake, no `Mcp-Session-Id`, the protocol version and capabilities in `_meta` of every request, `iss` validation in the OAuth flow, Roots, Sampling and Logging deprecated. `@appweaver/mcp` supports `2025-11-25` and older (`mcp/server/mcp-server.ts:27`) |
| `npm audit --omit=dev`    | 5 (3 high: `prisma` -> `@prisma/config` -> `effect` ReDoS; 2 moderate: `generate-api-key` -> `uuid`)        |

### E13. Sizes and debt

| Package       | Lines  | Comment lines | `any` | Largest file                                     |
|---------------|--------|---------------|-------|--------------------------------------------------|
| `data`        | 17,594 | 18%           | 211   | `resource/resource-service.ts` (1,723)           |
| `web`         | 14,252 | 14%           | 69    | `security/two-factor/two-factor-service.ts` (1,111) |
| `common`      | 9,790  | 32%           | 58    | `utils/geo-util.ts` (720)                        |
| `core`        | 7,374  | 17%           | 9     | `timeseries/time-series-service.ts` (659)        |
| `client`      | 7,320  | 22%           | 56    | `clients/modules/realtime-client.ts` (1,612)     |
| `realtime`    | 6,024  | 17%           | 1     | `gateway/realtime-gateway.ts` (1,795)            |
| `cli`         | 5,621  | 15%           | 11    | `generate/generate-prisma-schema.ts` (1,388)     |
| `create`      | 3,513  | 12%           | 2     | `scaffold/apply-modules.ts` (998)                |
| `ai`          | 2,985  | 19%           | 1     | `service/ai-service.ts` (1,045)                  |
| `mcp`         | 2,356  | 11%           | 4     | `web/oauth-routes.ts` (754)                      |
| Others        | 5,163  | 2-16%         | 27    | `testing/contracts/time-series-contract.ts` (300) |

Agent context: `AGENTS.md` ~28k tokens (loaded in every session in this repository), `skill/SKILL.md` ~18k,
`skill/GUIDELINES.md` ~4k, `skill/references/*` ~169k (`configuration.md` alone ~34k, `resources.md` ~26k).

Config units, counted: ~40 time keys in integer milliseconds, 7 in integer seconds
(`security.jwt.expiresIn`, `refreshExpiresIn`, `cors.maxAge`, `security.account.2fa.totp.period`,
`queue.keepCompletedSeconds`, `keepFailedSeconds`, `oauth2.apple.clientSecretExpiresIn`) and 9 duration strings
(`audit.retention`, `flushInterval`, `retentionInterval`, `storage.versions.pruneInterval`, `timescale.chunkInterval`,
`server.staticMaxAge`, `log.rotateInterval`, ...). Sizes mix `'100M'`, `'64KB'` and `'5 MB'`.

### E14. Custom SQL in the migrations (PostgreSQL 16 with `pg_trgm`, Prisma 7.10.1 and Prisma 8.0.0-rc.35)

**Prisma 7.10**: a migration created with `prisma migrate dev --create-only`, its `migration.sql` replaced by hand, then
applied, then `prisma migrate dev` run again with no change of the schema:

| Object created by the hand-written SQL                                   | Next `migrate dev`                                  |
|--------------------------------------------------------------------------|-----------------------------------------------------|
| `CREATE EXTENSION pg_trgm`                                               | kept                                                |
| Expression index `ON "Post" (lower("title"))`                            | kept                                                |
| Partial index `ON "Post" ("id") WHERE "status" = 'Published'`            | kept                                                |
| Function and `BEFORE INSERT OR UPDATE` trigger                           | kept                                                |
| View                                                                     | kept                                                |
| Trigram index `USING GIN ("title" gin_trgm_ops)`                         | **dropped** (`DROP INDEX`), silently, in a new migration |
| Generated column `"search" tsvector GENERATED ALWAYS AS (...) STORED` and its GIN index | **dropped** (`DROP COLUMN`, `DROP INDEX`), with only a data-loss warning |

Prisma 7 plans a migration by diffing the schema against a shadow database the migrations were replayed into, so
whatever it can model (columns, indexes on columns) and the schema does not declare is removed; what it cannot model
(triggers, functions, views, expression and partial indexes, extensions) is left alone. Declaring them keeps them:

- The trigram index declared as `@@index([title(ops: raw("gin_trgm_ops"))], type: Gin, map: "Post_title_trgm_idx")`:
  kept, no diff.
- The generated column declared as `search Unsupported("tsvector")?`: the next migration emits
  `ALTER COLUMN "search" DROP DEFAULT`, which PostgreSQL refuses (`column "search" ... is a generated column`), so
  `migrate dev` fails. Declared as `Unsupported("tsvector")? @default(dbgenerated("<expression>"))` with the expression
  exactly as PostgreSQL normalizes it (`to_tsvector('english'::regconfig, ((COALESCE(title, ''::text) || ' '::text) ||
  COALESCE(body, ''::text)))`): kept, no diff. Workable, but the string must match the database's rendering exactly.

**Prisma 8.0.0-rc.35** (scaffolded with `prisma orm init --target postgres`):

- A new CLI (`contract emit`, `migration plan|new|status|check`, `db migrate|verify|sign|update`), a PSL dialect of its
  own (`temporal.UpdatedAt`, `@onCreate(now())`), and migrations as **TypeScript ES modules** (`migration.ts`, a
  `Migration` class listing operations, run by Node to emit `ops.json`), which need `"type": "module"`: an Appweaver
  project is CommonJS.
- Migrations are planned **offline, from contract to contract**, never by diffing a database, so an object of the
  database the contract does not describe is not dropped by the next plan; `db verify` accepts it unless `--strict`.
- A hand-written migration may carry raw SQL (`rawSql({ ..., execute: [{ description, sql }] })`), but one that does
  not change the contract is refused at apply time (`MIGRATION.CONTRACT_SPACE_VIOLATION`, "a true no-op self-edge"): a
  standalone custom SQL migration needs a data invariant or a contract change to ride on.
- Expression and partial indexes are part of the Prisma 8 schema ([changelog of 2026-08-02](https://www.prisma.io/changelog/2026-08-02));
  partial indexes are a preview of Prisma 7.4+ already. Generated columns are not mentioned in either.
- Database targets on npm: `@prisma/orm-postgres`, `orm-sqlite`, `orm-mysql`, `orm-mariadb` (8.0.0-rc.25); **no SQL
  Server target**, and the supported-databases page lists SQL Server (and CockroachDB) without a Prisma 8 library yet.
  Prisma 7 receives fixes for 18 months after Prisma 8 is GA.
- Prisma 8 ships agent skills itself (`prisma skills sync`, a `postinstall` hook), the pattern of D18.

### E15. Response compression (`@fastify/compress` 9.3.0, Fastify 5.12.8, Node 24, 4 cores)

The plugin compresses a payload already in memory and at most `syncThreshold` bytes in one synchronous call (on the
event loop), and everything larger, every stream (the CSV export) and every web `ReadableStream` through a zlib stream,
which runs in the libuv thread pool, **off the event loop**. The default `syncThreshold` follows the cores the process
gets: 64 KB on 1 core, 8 KB on 2, 4 KB from 3 (it reads the cgroup CPU quota since Node 22.12, but a quota under one core,
`cpu: 500m`, reads as the host's cores). It supports `zstd` (Node 22.15+), `br`, `gzip` and `deflate`, a `threshold`
(1 KB by default), `customTypes` (by default the compressible types of `mime-db`), `respectNoTransform`, per-encoding
options, and a per-route `compress` route option (`false` or an object merged over the global options).

Measured with autocannon in the same process (20 connections, 5 s), so the numbers are relative:

| JSON payload     | Encoding                 | Bytes   | Req/s  | p99    | Event loop delay p99 |
|------------------|--------------------------|---------|--------|--------|----------------------|
| 2 KB (3 items)   | none                     | 2,216   | 50,614 | 1 ms   | 1.6 ms               |
|                  | gzip (synchronous)       | 235     | 19,964 | 5 ms   | 5.3 ms               |
|                  | gzip, streams only       | 235     | 5,406  | 15 ms  | 5.6 ms               |
|                  | brotli (quality 4)       | 204     | 11,404 | 7 ms   | 4.9 ms               |
|                  | zstd                     | 217     | 12,050 | 7 ms   | 5.7 ms               |
| 220 KB (300 items) | none                   | 221,981 | 2,716  | 13 ms  | 7.8 ms               |
|                  | gzip (streamed)          | 3,531   | 2,001  | 23 ms  | 9.2 ms               |
|                  | brotli (quality 4)       | 1,507   | 897    | 38 ms  | 11.3 ms              |
|                  | zstd                     | 1,486   | 1,963  | 22 ms  | 9.2 ms               |

- Small payloads: the synchronous path is ~4 times faster than streaming them, and blocks the loop for microseconds.
- Large payloads: the streamed compression leaves the event loop delay close to the uncompressed one; zstd is as fast as
  gzip with a 2.4 times smaller output, brotli is half as fast. (The test payload repeats itself, so the ratios are
  higher than real data; the speed order holds.)
- Node's `fetch` (the Appweaver client) decodes `zstd`, `br` and `gzip`, and asks for `gzip, deflate` by default.
- On localhost compression only costs CPU; the gain is the bandwidth and the transfer time of a real network.
- The thread pool has 4 threads by default (`UV_THREADPOOL_SIZE`), shared with the password hashing (`crypto.argon2`),
  the file system (the `local` storage) and DNS lookups: heavy compression can queue sign-ins.

---

## 4. Findings register

Every finding is confirmed (C) by a test or a measurement of section 3, or read (R) in the code. Severity: critical,
high, medium, low, or a design or performance finding.

| #   | Finding                                                                                                   | Kind        | Sev.   | Evidence | CR          |
|-----|-----------------------------------------------------------------------------------------------------------|-------------|--------|----------|-------------|
| F1  | Unbounded filters and a 100 MB JSON body: one anonymous request freezes the server                        | Security    | High   | C, E11   | V3-SEC-01   |
| F2  | A field omitted by a relation's `output.omit` can still be filtered on: an oracle                         | Security    | High   | C, E11   | V3-SEC-02   |
| F3  | The response cache replays per-request headers (CORS origin)                                              | Bug         | Medium | C, E10   | V3-SEC-03   |
| F4  | Reference sample: drafts readable anonymously, a write on every read                                      | Sample      | Medium | C, E2, E11 | V3-SAMPLE-01 |
| F5  | `allowedRedirectHosts` defaults to `['*']`                                                                | Security    | Medium | R        | V3-CONV-04  |
| F6  | JWT keys generated per instance in production                                                             | Security    | Medium | R        | V3-CONV-04  |
| F7  | CSV export without formula escaping; arrays never joined (`isArray && isString` cannot hold)              | Security, bug | Medium | R      | V3-SEC-04   |
| F8  | An OAuth-only account can be linked by another provider reporting the same, possibly unverified, email    | Security    | To verify | R     | V3-SEC-05   |
| F9  | App model named like a framework model: silently inconsistent                                             | Bug         | Medium | C, E9    | V3-DATA-01  |
| F10 | Audit fields (`createdById`) in every response, anonymous ones included                                   | Default     | Low    | C, E11   | Kept by default, removable (D5, revision 16) |
| F11 | Access token valid 7 days by default                                                                      | Default     | Medium | R        | V3-CONV-04  |
| F12 | Forced 2FA without enrolment: an unverified email or a missing phone locks the user out or adds nothing   | Design      | Medium | R        | V3-WEB-02   |
| F13 | Field visibility is static per model; per-audience projection is spread over `read`, relation `output.omit`, `mcp.exclude` and `export` | Design | - | R | V3-DATA-02 |
| F14 | Exposure defaults differ per surface; `export` and `aggregate` on for every model                         | Design      | -      | R        | V3-CONV-02  |
| F15 | Authenticated cached reads are keyed per user                                                             | Design      | -      | R        | V3-WEB-01   |
| F16 | Maintenance jobs are timers in every instance, no lock, no scheduler                                      | Design      | -      | R, E5    | V3-CONV-03  |
| F17 | Three time units and three size formats in the config                                                     | Consistency | -      | R, E13   | V3-CONV-01  |
| F18 | Five `KEEP_DATABASE_TABLE` keys                                                                           | Consistency | -      | R        | V3-CONV-05  |
| F19 | The total count is on by default and costs x16 at 100k                                                    | Performance | -      | C, E2    | V3-CONV-06  |
| F20 | `aggregate` runs one query per period, and covers 7 days without `from`/`to`                              | Performance, default | - | C, E2 | V3-CONV-07 |
| F21 | Projection walks the schemas for every record (~6-8% CPU)                                                 | Performance | -      | C, E3    | V3-PERF-03  |
| F22 | `flatted` serializes every cached response (~3% CPU)                                                      | Performance | -      | C, E3    | V3-WEB-01   |
| F23 | SQLite statements block the event loop; no server-side query timeout                                      | Performance | -      | C, E2    | V3-PERF-07  |
| F24 | `contains` text search scans (448 ms at 100k), relation filters 106 ms                                    | Performance | -      | C, E2    | V3-PERF-05  |
| F25 | Audit costs 19-31% throughput on SQLite and doubles p99                                                   | Performance | -      | C, E4    | V3-DATA-05  |
| F26 | The audit flush timer wakes every second while idle                                                       | Idle        | -      | C, E5    | V3-DATA-05  |
| F27 | Two TypeBox copies; the Fastify type provider infers with TypeBox 1 over 0.34 schemas                     | Dependency  | -      | C, E12   | V3-TOOL-06  |
| F28 | MCP server behind the current specification (2026-07-28)                                                  | Protocol    | -      | R, E12   | V3-MCP-01   |
| F29 | `ts-node` (unmaintained since 2023) loads the models; it and other tools need the TypeScript API          | Toolchain   | -      | C, E6    | V3-TOOL-03  |
| F30 | `noImplicitAny: false` despite `strict`; 108 implicit `any`                                               | Type safety | -      | C, E6    | V3-TOOL-01  |
| F31 | Decorator compiler flags without decorators; `baseUrl` deprecated                                         | Toolchain   | -      | C, E6    | V3-TOOL-01  |
| F32 | Tests changing the process directory can run `npm install` in the repository                              | Test safety | -      | C, E7    | V3-QA-02    |
| F33 | Generated client: 45% aliases, 42% `paths`, 29% comments; inapplicable operations listed                  | Size        | -      | C, E8    | V3-CLIENT-01..03 |
| F34 | `SKILL.md` ~18k tokens, `configuration.md` ~34k, `AGENTS.md` ~28k                                          | AI workflow | -      | C, E13   | V3-DOC-02, 03 |
| F35 | `generate-api-key` pulls a vulnerable `uuid`; `prisma` pulls a vulnerable `effect`                        | Dependency  | Low    | C, E12   | V3-SEC-06   |
| F36 | A JSON array in an array env variable is silently one string                                              | Config      | Low    | C, E10   | V3-COMMON-01 |
| F37 | `data/utils/file-util.ts:145` reads the `SERVER_BODY_MAX_SIZE` of web from data                          | Layering    | Low    | R        | V3-SEC-01   |
| F38 | Swagger UI on in production by default                                                                    | Default     | Low    | R        | Kept, documented (decision 2) |
| F39 | A policy receives `null` for an anonymous request and for the application's own calls alike (jobs, seeders, tests), so it cannot restrict the first without the second; the `cms-api` fix reads `currentRequestScope()?.source` | Design | Medium | C | V3-DATA-06 |
| F40 | Two `cms-api` e2e tests of the 2FA (phone verification, method order) fail on `main` too               | Test        | Low    | C        | V3-QA-03    |
| F42 | No supported way to add SQL that Prisma does not generate: `weaver migration new` applies at once (no `--create-only`), and what Prisma can model but the schema does not declare (a generated column, a trigram index) is dropped by the next migration | Design | Medium | C, E14 | V3-DATA-07 |
| F43 | Prisma 8 has no SQL Server library (RC targets: PostgreSQL, SQLite, MySQL, MariaDB); Appweaver supports SQL Server (`hr-api`) | Platform | High | C, E14 | None (D16) |
| F44 | Prisma 8 migrations are TypeScript ES modules; Appweaver projects are CommonJS (D13) | Platform | Medium | C, E14 | None (D16) |
| F45 | Abbreviations of the framework's own in the public API: `geo` (model key, 7 exported types, 6 functions), `2fa` (config section, routes, JWT scope, 5 error codes) beside `twoFactor` everywhere in the code, `OTT` (5 config keys, 2 exported types), `SEP` (`export.csvAddSepRow`), the confusable CLI aliases `mge` and `mgn` | Consistency | Low | R | V3-CONV-08 |
| F41 | The `cms-api` listing had no index for the restricted public query: 7 req/s at 100k until one was added; the sample indexes are not checked against the queries their policies build | Sample | Low | C | V3-SAMPLE-02 |

---

## 5. Decisions

Each decision answers one item of the original task list. **Decided** means the recommendation of this plan after the
experiments; it is still subject to the approval of its CR.

### D1. Model views: input and output per audience — **decided: add, as an extension of the model**

**Problem**: F13. Today one model has one output, one create and one update shape. The reference sample needs three
audiences already: the public reads a post without its drafts and audit fields, the author edits it, the admin sees
everything; and it hand-writes the public shape of `User` as an `output.omit` list on the `author` relation, which is
also what made the email filterable (F2). The `viewCount` increment had to bypass the service (F4).

**Decision**: a model declares named views. A view is a static projection: the fields it reads, the fields it writes,
the write operations allowed per field. Routes, policies, MCP tools, realtime events, exports and relations bind to a
view. The schemas stay static, so the OpenAPI document, the clients, the serializers and the cache stay precise.

```ts
export default createModel({
  name: 'Post',
  scalars: { /* defined once */ },
  views: {
    public: {
      read: { omit: ['status', 'seo'], audit: false },   // no audit fields
      write: { pick: ['viewCount'], operations: { viewCount: ['increment'] } }
    },
    author: { read: { omit: ['seo'] }, write: { omit: ['uid', 'viewCount'] } }
    // the model itself is the full view, as today
  }
});

// routes: one createRoutes per view and path
export const publicPosts = createRoutes({ modelName: 'Post', view: 'public', path: '/posts', actions: ['find', 'query'] });
export const adminPosts = createRoutes({ modelName: 'Post', path: '/admin/posts', defaults: { roles: ['Admin'] } });

// policy of a view, composed with the model policy (both must allow)
export default createPolicy({ modelName: 'Post', view: 'public', readRestrictions: () => ({ status: 'Published' }) });

// relation output bound to a view of the related model, replacing the omit list
author: { model: 'User', type: 'manyToOne', output: { type: 'always', view: 'public' } }
```

**Rules**: a view only removes fields from the model, never adds them; the filters and sorts of a route accept only the
fields readable through its view, recursively through the views of its relations (this closes F2 by construction);
the cache key includes the view; `mcp` and `events` take a `view`, so an agent reads the slim shape (fewer tokens).

**Rejected**: (A) a per-user field mask in the policy at runtime: the OpenAPI document cannot show it, clients lose
their types, the cache key must include the mask; (C) one route switching shapes per role: a union response schema,
bad for clients, serialization and caching.

**Evidence of feasibility**: `buildModel` (`data/factory/create-model.ts:299`) already builds every schema from the
`read`, `create` and `update` pick/omit of the config, and `projectRecord` (`data/utils/record-util.ts:17`) projects by
schema. A view is `buildModel` over the view's config with its own `$id` (`PostPublic`, ...). Two blockers to solve:
the route registry is keyed by model name (`define` of routes, `core/context/dependency-injection.ts:80`), so it must
be keyed by model and view; and the generated types and client need one type set per view.

**Breaking**: no, additive. The relation `output.omit` and `mcp.exclude` stay as they are, not deprecated: they remove a
few fields of one relation or tool, a view names a whole shape.

### D2. Extending and overriding framework models, services, policies and routes — **decided: `extend*`, and duplicates fail**

**Problem**: an application cannot add a field, an index or an export config to `ApiKey`, `File`, `Role`, `AuditLog`
or any module model, and redefining one by name is silently inconsistent (F9).

**Decision**:

```ts
// src/resources/api-key/model.ts
export default extendModel('ApiKey', {
  scalars: { label: { type: 'string', required: false } },
  indexes: [{ fields: ['label'] }],
  read: { omit: ['createdById'] }
});
export const apiKeyService = extendService('ApiKey', { afterCreate: async (key) => { /* ... */ } });
export const apiKeyRoutes = extendRoutes('ApiKey', { defaults: { roles: ['Admin', 'User'] } });
```

- Merge field by field: an extension adds fields and overrides the options of existing ones; it cannot remove a field
  the framework uses, and an added field must be optional or have a default, since the framework creates these records.
- A policy of the application for a framework model **composes** with the framework one (both must allow), so an
  extension cannot loosen a framework guard by accident.
- Service hooks compose: the framework hooks run first.
- A second model, service, policy or routes under a taken name without `extend*` **fails at startup**, naming both
  files. This alone is a 2.x patch (a warning) and a v3 error.

**Auth model**: `createAuthModel` already merges the application config into the framework fields with an allow list
(`data/security/create-auth-resources.ts:64`, `overridableProperties`). Rewriting it as `extendModel('User', ...)` would
be churn without a benefit: **rejected**. It keeps its API and moves onto the same merge engine, and `createAuthService`
gets the same composition rule.

### D3. Framework-owned models: ApiKey versus the audit log — **decided: keep ApiKey in the framework**

**Question of the task**: hand the ApiKey routes, service and policy over to the application, like the audit log?

**Decision**: no. Its invariants (a key never grants more than its owner holds, only a JWT session manages keys) are
security-critical; moving them out turns a framework guarantee into documentation. The inconsistency is resolved the
other way: every framework model ships its model, service, policy and routes; the audit routes become optional
(`audit.routes.enabled`, read-only, admin only, off by default); the application customizes through D2. The five
`KEEP_DATABASE_TABLE` keys (F18) become one list, `database.keepTables: ['ApiKey', 'AuditLog', ...]`.

### D4. Exposure: one rule and one syntax for REST, bulk, events and MCP — **decided**

**Problem**: F14. CRUD on and opt-out, bulk off through env flags, events and MCP opt-in, each with its own syntax;
`export` (a CSV of everything readable) and `aggregate` are on for every model.

**Decision**: one `actions` list on every surface, the same names everywhere:

```ts
createRoutes({
  modelName: 'Post',
  path: '/posts',
  actions: ['find', 'query', 'create', 'update', 'delete', 'export'],  // REST; default: 'crud'
  find: { public: true },
  events: { actions: ['create', 'update'] },                          // none unless listed
  mcp: { actions: ['find', 'query'], view: 'public' }                  // none unless listed
});
```

- REST defaults to `crud` (`find`, `query`, `create`, `update`, `replace`, `delete`); `aggregate`, `export` and the bulk
  routes are listed when wanted; file and series routes follow the model (on when it has file or series fields).
- Events and MCP stay opt-in: they expose data to new channels and agents.
- The `RESOURCE_BULK_*_ENABLED` flags are removed: exposure is code, never config.
- `weaver routes` prints every route, event and tool per model, with its auth, view and cache, for humans and agents.

**Rejected**: everything opt-in (every model would need a list for the common case); per-surface defaults as today.

### D5. Secure and realistic defaults — **decided, the table below**

| Key                                                | Today           | v3                                            | Why                     |
|----------------------------------------------------|-----------------|-----------------------------------------------|-------------------------|
| Audit fields in responses                          | shown           | shown (decided, revision 16); left out where a response should not carry them: per model (`read.omit`, as the framework's `Role` does), per view (`read.audit: false`, D1) or per relation (`output.omit`) | F10 |
| `security.jwt.expiresIn` / `refreshExpiresIn`      | 7 d / 60 d      | 15 min / 30 d, refresh rotation with reuse detection (decided: short-lived tokens refreshed regularly) | F11 |
| `security.jwt.autoGenerateKeys`                    | `true`          | `true` in `dev` and `test` only; otherwise fail at startup without keys or a secret | F6 |
| `security.allowedRedirectHosts`                    | `['*']`         | the host of `app.hostname`                     | F5                     |
| `cors.origin`                                      | `['*']`         | `['*']` in `dev` and `test`; a warning at startup in production while `*` | Realistic |
| `swagger.enabled`                                  | `true`          | `true` (decided: kept on in every environment; a production deployment turns it off with `swagger.enabled: false`, documented) | F38 |
| `server.bodyMaxSize`                               | `100M`, every route | `1M` for JSON; uploads by the file fields' `maxSize` | F1          |
| Filter complexity                                  | unbounded       | `resource.filter.maxConditions: 100`, `maxDepth: 5`, `maxListValues: 1000` (SQL Server takes 2,100 parameters) | F1 |
| `query` `totalCount`                               | `true`          | `false`, and bounded (D10); a client asks `totalCount: true` on its first page for the number of pages, and not on the next ones | F19 |
| `aggregate` without `from`/`to`                    | last 7 days     | the whole range of the filter, `interval` required for periods | F20     |
| `export`, `aggregate`, bulk routes                 | on / env flags  | listed in `actions`                            | D4                     |
| `security.account.2fa.forced`                      | boolean, `Email` fallback | see D6                               | F12                    |
| Password `minLength`                               | 8               | 8, documenting 15 when the password is the only factor (NIST SP 800-63B-4), plus a breached-password hook | Realistic |

### D6. Forced 2FA lifecycle — **decided: an enrolment step instead of a silent fallback**

**Problem**: F12. With `forced: true`, a user without a method is challenged with the `defaultMethod` (`Email`,
`web/security/two-factor/utils/method-util.ts:23`), even when their email is unverified; with `Sms` and no phone the
user is locked out; and an email code on the same address that resets the password adds little against a compromised
mailbox.

**Decision**:

1. `forced` becomes `forced: false | true | { roles: string[] }` (per role).
2. First sign-in of a forced user without a confirmed method: the tokens get an `enroll` scope, valid only for the 2FA
   setup routes (like the `2fa` scope today), until a method is confirmed; then full tokens.
3. `gracePeriod` (a duration): during it, a forced user may still sign in fully and is told to enrol (`enrollBy` in the
   response); after it, the `enroll` scope applies.
4. The default method only serves users who already have a **verified** channel for it; nobody gets a code on an
   unverified address.
5. Recovery codes are issued when the first method is confirmed; an admin route resets the methods of a user.
6. Startup fails when `forced` names a method without its service (no mailer for `Email`, no SMS sender for `Sms`, no
   `totp.encryptionKey` for `Totp`).
7. API keys stay outside 2FA (documented); the MCP sign-in and OAuth2 sign-ins follow the same steps.

### D6b. Remembered 2FA devices — **decided: opt-in device tokens, in phase 4 with D6**

**Need**: a user who passed 2FA on a device may skip it there on the next sign-ins, until the device is forgotten.

**Today**: `POST /auth/login` answers a 2FA user with a token of the `2fa` scope, `/2fa/challenge` sends a code,
`/2fa/verify` turns the code into a one-time token, and `/exchange-token` turns that into the tokens of the `auth` scope;
OAuth2 sign-ins reach the same exchange, the MCP sign-in has a 2FA step of its own, and basic auth refuses 2FA users. The
decision to require 2FA is taken in one place (`AuthService.login` and `exchangeToken`, `web/security/auth-service.ts`),
where a device check fits.

**Decision**:

1. Config `security.account.2fa.rememberDevice`: `enabled` (default `false`), `ttl` (a duration, default `30d`),
   `maxDevices` per user (default `10`, the oldest forgotten beyond it), `rotate` (default `true`).
2. `/2fa/verify` takes `rememberDevice: true`; the one-time token carries it, and `/exchange-token` then also answers a
   `deviceToken` (256 random bits) with its `deviceTokenExpiresIn`.
3. A framework model `TrustedDevice` keeps the user, the SHA-256 of the token (never the token), a label from the user
   agent, and the creation, last use and expiration times. Kept or pruned like the other auth models (`database.keepTables`,
   V3-CONV-05).
4. `POST /auth/login` and `/exchange-token` (OAuth2) take the `deviceToken`: a valid, unexpired token of that same user
   skips the `2fa` scope and answers the tokens of the `auth` scope; with `rotate`, a new device token replaces it in the
   answer, so a stolen copy stops working once the device signs in again. An unknown, expired or foreign token is
   ignored: the sign-in asks for 2FA as usual, with no error that would tell a guess from a stale token.
5. Every device of a user is forgotten on a password change or reset, a 2FA method enabled or disabled, the admin reset
   of the 2FA (`resetTwoFactor`), a logout of every session (`logoutAt`), and the user disabled or deleted.
6. Routes under `/auth/account/2fa/devices`: list (label, created, last used, expires), forget one, forget all.
7. The device is identified by the token alone. No fingerprinting by IP or browser (unstable, a privacy concern); the
   user agent is only the label of the list. No notification email.
8. A remembered device skips the code challenge, never the enrolment of a forced user (D6 2.); basic auth still refuses
   2FA users; the MCP sign-in page keeps asking for the code (its forms could remember a device with a cookie later).
9. The audit log records a device trusted, used and forgotten (`auth` category).

**Risk**: whoever steals the device token from the client's storage skips the second factor on that account until it
expires, rotates or is forgotten, but still needs the password. The `ttl`, the rotation and the forgetting events bound it.

**Effort**: about 4 days (the model and its schema, the token flow and the revocation events, the routes and the
client methods, the tests and the docs). In phase 4 with V3-WEB-02, since both change the same sign-in, verify and
exchange code.

### D7. Caching of resource reads — **decided: explicit scopes, enforced at startup**

**Problem**: F15 (per-user keys on authenticated routes), F3 (replayed headers), F22 (flatted), and the key is built
twice per request (`preHandler` and `onSend` of `web/cache/caching.ts`).

**Decision**: `cache: { scope: 'public' | 'user' | 'shared', ttl }`.

- `public`: routes without authentication, as today.
- `user`: authenticated, keyed by user (today's behavior).
- `shared`: authenticated, one entry for every user. Accepted only when the response cannot depend on the user: the
  view and the policy of the action have no `readRestrictions`, no user-dependent virtual field, no `events` callback;
  checked at startup, failing otherwise. The response is computed once and served to everyone allowed by the route.
- A cache entry stores the status, the payload and an allow list of headers (`content-type`, `content-disposition`,
  `etag`, `last-modified`), never CORS, rate-limit, cookie or request-ID headers.
- The key is computed once per request; the stored value is plain JSON (the payload is already a string).

**Rejected for now**: a scope keyed by the roles and permissions the policy reads: unsafe unless policies declare what
they read, which they do not.

### D8. Audit log off the hot path — **decided**

**Problem**: F25, F26. The diff is computed in the request (`recordChange`, `data/audit/audit-service.ts:209`), the
flush timer runs every second, and on SQLite the batched inserts run on the event loop.

**Decision**:

1. The request only appends to a bounded ring buffer (`audit.bufferSize`); the diff is computed at flush time from the
   two snapshots. A full buffer drops the oldest entries and counts them in a metric and a warning.
2. The flush timer starts with the first entry and stops when the buffer is empty.
3. With a `Queue`, the flush sends one job per batch (`audit.writeVia: 'queue'`), so the API instances only enqueue.
4. Reads are not audited unless enabled (already the default; the sample enables them).
5. Acceptance: on PostgreSQL at 100k records, p95 within 5% and p99 within 10% of the audit off (phase 6).

### D9. Maintenance jobs — **decided: one registry, run once per cluster**

**Problem**: F16. Audit retention, time series retention (`database` driver), file version pruning, each a
`setInterval` in every instance (`data/audit/audit-service.ts:129`, `data/timeseries/database-time-series.ts:116`,
`data/storage/file-service.ts:140`).

**Decision**: a `defineMaintenanceJob({ name, schedule, run })` registry in core.

- With the `Scheduler` enabled, a job runs on its cron schedule; without it, on a timer started on the first run.
- A job takes a lock in the `Memory` provider (`redis` across instances) for its run, or with a `Queue` it is enqueued
  with a deduplication ID, so one instance runs it.
- `weaver run maintenance:<job>` runs one once (a Kubernetes cron job, a worker process).
- `maintenance.enabled: false` turns them off on API instances; `maintenance.jobs.<name>.schedule` and `.enabled`
  replace `audit.retentionInterval`, `audit.retentionWorker`, `timeseries.database.retentionInterval`,
  `retentionWorker` and `storage.versions.pruneInterval`.
- Deletes run in batches of `maintenance.batchSize`, so a purge never holds a long lock.
- Also registered: the expired one-time tokens and security store entries, and the soft-deleted records past a
  `softDelete.purgeAfter`, when set.

**Honest note**: with one instance today's timers work; the gain is multi-instance correctness and visibility.

### D10. Query performance defaults — **decided**

1. `totalCount` defaults to `false` (F19); when asked, the count is bounded by `resource.countLimit` (10,000) with
   `count({ where, take })`, answering `totalCount: 10000, totalCountExact: false` beyond it.
2. The batch `$transaction` around find and count (`data/resource/resource-service.ts:280`) is measured on its own
   on every database: E2 shows the count costs 60 ms at 100k, not yet what the transaction adds. It is dropped where
   it only adds cost.
3. `aggregate` runs one `GROUP BY` per request with the date truncation of each database (`date_trunc`, `strftime`,
   `DATE_FORMAT`, `DATETRUNC`), reusing the per-database SQL of the time series drivers; `first`/`last` with window
   functions (F20).
4. Cursor pagination becomes the documented default of list UIs; offset pages beyond `resource.maxOffset` (10,000)
   are refused with a hint to use the cursor.
5. Text search gets a full-text mode per database (`textSearch: { mode: 'fts' }`: FTS5, `tsvector`, `FULLTEXT`, SQL
   Server full-text) generated by `weaver generate`; `contains` stays for small tables (F24).

### D11. Durations and sizes — **decided: one `Duration` and one `Size` type**

**Rejected**: seconds everywhere (sub-second keys exist: the 200 ms Redis command timeout, the 20 ms relay flush);
milliseconds everywhere as integers only (`604800000` is unreadable).

**Decision**: a duration key accepts an integer of milliseconds or a string with a unit (`'200ms'`, `'15m'`, `'7d'`);
a size key accepts an integer of bytes or a string (`'64KB'`, `'5MB'`). Parsed once when the config loads; milliseconds
and bytes in the code. The units leave the key names (`keepCompletedSeconds` -> `keepCompleted`, `keepFailedSeconds` -> `keepFailed`).

**No exception (revision 17)**: the keys in seconds today (`security.jwt.expiresIn`, `refreshExpiresIn`, `cors.maxAge`,
`queue.keepCompletedSeconds`, `keepFailedSeconds`, `security.oauth2.apple.clientSecretExpiresIn`) take milliseconds or a
unit string in v3 like every other duration key, with no compatibility mode: a project upgrading writes `'7d'` (or
`604800000`) where it wrote `604800`, listed in `MIGRATION-v3.md`. The only key keeping seconds is the TOTP `period`, an
integer defined in seconds by RFC 6238, which authenticator apps only accept as 30.

### D12. TypeScript — **decided: wait for TypeScript 7.1, then move everything to it**

**Evidence**: E6. TypeScript 7.0 builds 4.7 times faster but ships no compiler API, and four of our runtime tools need
one (`ts-node`, `typebox-codegen`, `openapi-typescript`, typescript-eslint). TypeScript 7.1, which ships the API, is
scheduled for the coming weeks (`7.1.0-beta` is on npm, and typescript-eslint 8.74 already accepts it through
`@typescript/native`).

**Decision**:

1. No intermediate step on TypeScript 6 or a split build: v3 moves from 5.9 straight to **TypeScript 7.1**, for the
   monorepo, the published packages and the scaffolded projects alike. Development starts now on the latest
   `7.1.0-beta` (or RC), pinned exactly; the stable 7.1.0 replaces it before 3.0.0 is released, and nothing is released
   on a beta. Prisma stays on 7.x (D16).
2. The config changes E6 found are made with it: `baseUrl` removed (the `paths` relative to the config), `types` and
   `typeRoots` listed explicitly, the decorator flags removed, the client's CommonJS build off `moduleResolution:
   node10`, the `WebSocket.send` typing fixed, and `noImplicitAny: true` (108 fixes). The config cleanup that is
   valid on 5.9 too (decorator flags, `noImplicitAny`) may land earlier, in phase 1b.
3. `ts-node` is replaced by `tsx` (its `register` API) for loading the project's models: `ts-node` will not follow
   TypeScript 7.
4. On the 7.1 beta, then again on the stable release, a check of every tool needing the API: typescript-eslint, `openapi-typescript` (the client
   generator), `typebox-codegen` (`weaver generate --types`, replaced in V3-TOOL-06 if it does not follow) and madge.
   A tool that does not support 7.1 yet keeps `typescript@6` as its own aliased dependency (`"typescript-api":
   "npm:typescript@6"`) until it does, so it never holds the migration back.
5. CommonJS output stays (see D13).

### D13. ESM — **decided: not in v3**

ESM-only would touch the runtime `require` of providers and modules (`common/utils/module-util.ts`), the Prisma client
output, the Jest setup and every scaffolded project, while nothing in E1-E12 shows a user-facing gain. The client
package already ships ESM and CommonJS. Revisited once the project runs on TypeScript 7.1.

### D14. Test runner — **decided: stay on Jest with SWC**

**Evidence**: E7. Vitest is slower on this suite (73 s against 33 s at best), not a drop-in (45 to 47 failing files,
the framework's runtime `require` of TypeScript sources), and its threads broke the directory isolation of tests that
install packages. SWC stays as the Jest transformer: it is its only use and the fastest option. **Rejected for v3**;
revisited with ESM. What the spike taught is applied anyway: tests never rely on `process.chdir` to isolate a command
that installs packages (V3-QA-02).

### D15. Lint, format and test tooling — **decided: `@appweaver/tooling`, thin CLI commands**

Not inside `@appweaver/cli`: it would make the CLI heavy and pin every project's lint versions to ours. A
`@appweaver/tooling` dev dependency carries the configs (ESLint 10 flat config, Prettier, Jest with SWC) and the tools as
its own dependencies, replacing the 17 packages of `scaffoldDependencies.tooling` in a project. `weaver lint`,
`weaver format` and `weaver test` resolve the tools from the project. Biome or oxlint: re-evaluated on TypeScript 7.1
(type-aware rules are the deciding factor). ESLint 10 regardless.

### D16. Prisma — **decided (revision 7): Prisma 7, as used so far**

v3 keeps Prisma 7 the way Appweaver uses it today: the latest 7.x, bumped within 7.x as usual, and the migration
commands as they are (`weaver migrate`, `weaver migration`, `weaver seed`, `weaver test`). No Prisma 8 work is planned,
and no code prepares a switch. Prisma 8 was evaluated (E12, E14: no SQL Server library, a new CLI, PSL dialect and
migration model, migrations as ES modules); the findings stay in this file for reference, and a later switch would be a
decision of its own.

Prisma 7 features used in v3: the extended index options (`type: Gin`, `ops`) and, behind its `partialIndexes`
preview (7.4+), partial indexes, both for D22 C.

### D17. TypeBox 1.x — **decided: yes, in v3**

The repository already holds both (F27), and the Fastify type provider infers route types with TypeBox 1 over our 0.34
schemas. TypeBox is public API (config sections, schemas), so a major is the moment. `typebox-codegen` (used by
`weaver generate --types`) is checked for a TypeBox 1 path, else replaced by our own emitter of the registry types.

### D18. Skill as a package — **decided: `@appweaver/skill`, and a smaller skill**

A dev dependency released with the framework; `weaver skill sync` (also run by `weaver upgrade`) copies it into
`.claude/skills`, `.agents`, ... The size matters more than the packaging (F34): `SKILL.md` goes under ~5k tokens as an
index of the references; `configuration.md` (~34k tokens) is generated from the config schema per module; `AGENTS.md`
of this repository goes under ~8k tokens, the details moved to `docs/contributing/*.md` read on demand.

### D19. Generated client — **decided**

1. Types and client in separate files by default (`client.ts`, `client.types.ts`).
2. A resource client lists its used operations or its omitted ones, whichever is shorter, and never the operations its
   model cannot have (files, series).
3. The per-model aliases (`Single`, `Multiple`, `Create`, `Update`, `Replace`, `QueryFilter`, `QuerySort`,
   `QueryRequest`, `QueryResponse`, `RelationCreate`) are derived by generic types of the runtime library from one
   `ResourceTypes` map per model; `paths` keeps only the custom routes.
4. Doc comments opt-in (`--comments`).
5. Target: `movies-client.ts` from 7,425 to under 3,500 lines with the same type safety, and the type-check time of a
   consumer measured before and after.

### D20. MCP 2026-07-28 — **decided: support it, keep 2025-11-25**

Our transport is already sessionless, so the stateless core fits: accept the protocol version and capabilities from
`_meta` without `initialize`, keep answering `initialize` for older clients, validate `iss` in the OAuth flow, drop
nothing we use (we implement neither Roots, Sampling nor Logging).

### D22. Custom SQL migrations — **decided: an Appweaver SQL migration layer, independent of Prisma**

**Need**: SQL Prisma does not generate (a trigram index, a `GENERATED ... STORED` column, a trigger, a function, a view,
a full-text index, a check constraint), versioned with the project and applied by `weaver migrate`, with variants per
database.

**Options**

- **A. Hand-edited Prisma migrations** (`--create-only`, then edit `migration.sql`). Works on Prisma 7 for what Prisma
  cannot model, interleaved with the generated migrations for free. But what Prisma can model is dropped by the next
  migration unless declared (E14), a migration directory belongs to one provider (`migration_lock.toml`), so no
  per-database variants, and module packages cannot ship them.
- **B. An Appweaver SQL migration layer**: plain SQL files Appweaver tracks and applies itself, after the Prisma
  migrations. Independent of Prisma's migration format, per-database variants by file name, usable by module
  packages, and the same mechanism the framework already relies on for the PostGIS triggers and the TimescaleDB
  hypertables (`setupDatabase`, after `prisma migrate deploy`).
- **C. Model-level declarations** generating the SQL (an index `type`/`ops`/`where`/expression, a `generated` field).
  The best experience for the common cases, but it covers only what is foreseen.

**Decision**: B as the mechanism, C for the common cases on top of it, A kept as an escape hatch of Prisma 7 only (a
`--create-only` option on `weaver migration new`, documented with its limits).

**Layout and naming** (`database.sqlDirPath`, default `./database/sql`):

```
database/sql/
  20261201_post_search.sql                  # any database
  20261201_post_search.postgresql.sql       # replaces the generic file on PostgreSQL
  20261201_post_search.sqlite.sql           # replaces it on SQLite
  20261205_post_trgm.postgresql.sql         # PostgreSQL only: no generic file, skipped on the others
  views/published_posts.sql                 # repeatable: applied again whenever its checksum changes
```

- A file name is `<version>_<name>[.<database>].sql`, `<database>` exactly one of the values of the `DatabaseType`
  enum of `@appweaver/common` (`sqlite`, `postgresql`, `mysql`, `sqlserver`, the values of `database.type`); any other
  suffix fails `weaver migrate` (decided, decision 7 of section 9). For one version and name, the variant of the current database is
  applied if there is one, else the generic file, else nothing. Files run in version order.
- `views/`, `functions/`, `triggers/` hold **repeatable** files (`CREATE OR REPLACE ...`), re-applied when their checksum
  changes, after the versioned ones.
- A file runs in one transaction where the database has transactional DDL (PostgreSQL, SQLite, SQL Server), unless it
  starts with `-- appweaver:no-transaction` (i.e. `CREATE INDEX CONCURRENTLY`); MySQL commits each statement.
- Statements are split by the database's own rules (dollar quoting, `BEGIN ... END` bodies, `GO` on SQL Server), or
  the file is sent whole where the driver accepts several statements.

**Tracking**: a framework model `SqlMigration` (name, database, checksum, applied time, duration), declared in the
Prisma schema like `Seeder` so Prisma never drops its table, pruned when the directory does not exist. A versioned
file changed after it was applied fails `weaver migrate` (like a seeder's checksum), unless `--fix-checksums`.

**Commands**:

- `weaver migrate`: the Prisma migrations, then the SQL migrations, then `setupDatabase`.
  `--dry-run` lists the pending SQL files with their content.
- `weaver migration new <name> --sql [--database <type>]` scaffolds a file; `weaver migration new <name>
  --create-only` creates a Prisma migration to edit (option A).
- `weaver test setup`, `weaver test reset` and `weaver migration reset` apply them after the reset, so the tests and a
  reset database have them.
- Module packages ship theirs (`sql` of the manifest), applied before the application's, each tracked under its module
  name, like the seeders.

**Keeping Prisma from dropping them**: with Prisma 7, `weaver migration new` and `weaver migration check` read the SQL
Prisma plans and **fail when it drops a column or an index a SQL migration created** (the names are parsed from the
`CREATE`/`ALTER ... ADD COLUMN` statements of `database/sql`), telling to declare it (C) or to use a trigger.

**Model declarations (C)**, generating both the Prisma schema and, when needed, a SQL migration:

```ts
index: [
  { fields: ['title'], type: 'gin', ops: 'gin_trgm_ops' },         // @@index([title(ops: raw(...))], type: Gin)
  { expression: 'lower("email")' },                                // a SQL migration, Prisma 7 has no expression index
  { fields: ['id'], where: `"status" = 'Published'` }              // the partialIndexes preview of Prisma 7.4+
],
scalars: {
  search: { type: 'unsupported', dbType: 'tsvector', generated: { sql: '...', stored: true }, hidden: true }
}
```

A generated column is the fragile case (E14): on Prisma 7 it needs the expression exactly as the database renders it,
so `weaver generate` reads it back from the database after the SQL migration, or the column is left to a trigger. It
lands last, after the layer.

**Honest notes**: the layer runs after every pending Prisma migration, so a SQL file cannot sit between two Prisma
migrations of the same deploy; a file referencing a column a later Prisma migration drops breaks. A project can
already put custom SQL in its Prisma migrations today; the layer is what makes it portable across databases and module
packages, and safe from the drops of E14.

### D23. Full names instead of abbreviations — **decided: rename the framework's own abbreviations, keep the standard ones**

**Problem**: F45. A reader, human or agent, has to guess what `geo`, `2fa` or `OTT` stand for, and `2fa` is used for the
config, the routes and the errors while the code says `twoFactor` (`TwoFactorService`, `TwoFactorMethod`). An env name
`SECURITY_ACCOUNT_2FA_ENABLED` has a segment starting with a digit. One name per concept, written out, is the rule of
"one way to do things".

**Renamed** (a clean switch, revision 18: the old names stop working in v3, with no alias; `MIGRATION-v3.md` lists each
one with its new name):

| Today                                                                                   | v3                                                                                                   |
|-----------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| Model key `geo: { location: { type: 'point' } }`                                        | `spatial: { location: { type: 'point' } }` (decided, revision 10)                                    |
| `GeoConfig`, `GeoField`, `GeoFieldType`, `GeoFilterOperators`, `GeoConditionSchema`, `GeoColumns`, `GeoModel` | `SpatialConfig`, `SpatialField`, `SpatialFieldType`, `SpatialFilterOperators`, `SpatialConditionSchema`, `SpatialColumns`, `SpatialModel` |
| `geoColumns`, `geoFieldSchema`, `geoStorage`, `geoDistance`, `geoModelOf`, `hasGeo`     | `spatialColumns`, `spatialFieldSchema`, `spatialStorage`, `spatialDistance`, `spatialModelOf`, `hasSpatialFields` |
| Config section `security.account.2fa` (`SECURITY_ACCOUNT_2FA_*`), `.2fa.totp`           | `security.account.twoFactor` (`SECURITY_ACCOUNT_TWO_FACTOR_*`), `.twoFactor.totp`                    |
| Routes `/auth/account/2fa/*`                                                            | `/auth/account/two-factor/*` (the old paths removed)                                                 |
| JWT scope `2fa`, `AuthScope.TwoFA`, `AuthOTTPurpose.TwoFAVerification` (`2faVerification`) | `twoFactor`, `AuthScope.TwoFactor`, `OneTimeTokenPurpose.TwoFactorVerification`                  |
| Error codes `ACCOUNT_2FA_*` (5)                                                         | `ACCOUNT_TWO_FACTOR_*`                                                                               |
| `security.authOttTtl`                                                                   | `security.exchangeTokenTtl` (the one-time token of `/exchange-token`)                               |
| `security.account.verifyEmailOttTtl`, `resetPasswordOttTtl`, `verifyPhoneOttTtl`        | `verifyEmailTokenTtl`, `resetPasswordTokenTtl`, `verifyPhoneCodeTtl`                                 |
| `security.account.2fa.ottTtl`                                                           | `security.account.twoFactor.challengeTtl`                                                            |
| Types `AuthOTTData`, `AuthOTTPurpose`                                                   | `OneTimeTokenData`, `OneTimeTokenPurpose`                                                            |
| `export.csvAddSepRow`                                                                   | `export.csvAddSeparatorRow`                                                                          |
| CLI aliases `mge` (`migrate`) and `mgn` (`migration`), one letter apart                 | removed; the other aliases (`g`, `b`, `s`, `r`, `sd`, `cfg`, `oa`, `mod`, `up`, `t`) stay as shortcuts of full names |

**Why `spatial` rather than `geometry`** (decided, revision 10): the config section, the service and the engines are already
named `spatial` (`spatial.provider`, `SpatialService`, `PostgisSpatialEngine`, `skill/references/spatial.md`), and
`geometry` is one of the field types (`point`, `lineString`, `polygon`, ..., `geometry`), so `geometry: { shape: { type:
'geometry' } }` would read twice the same word for two things.

**Kept on purpose**:

- Standard acronyms every reader knows: JWT, CORS, OAuth2, TOTP, SMS, AI, MCP, API, URL, IP, CSV, SSE, HTTP, and Twilio's
  own `SID`.
- `TTL`, `MAX`/`MIN`, and `DIR` in the `*_DIR_PATH` keys, which match the `--*-dir` flags of the CLI conventions.
- `pubsub` and `PubSub`, the usual name of the pattern.
- The filter operators `_ne`, `_gt`, `_gte`, `_lt`, `_lte`, `_in`, `_nin`, `_ilike`: the vocabulary of Prisma and
  MongoDB that every agent already writes; renaming them would cost every query of every application for no clarity.
- The GeoJSON types (`GeoPoint`, `GeoPolygon`, `GeoLineString`, `GeoMultiPoint`, `GeoMultiLineString`,
  `GeoMultiPolygon`, `GeoGeometry`, `GeoPosition`, `GeoLatLng`, `GeoBox`): their `Geo` is the GeoJSON standard's, they
  describe its objects.
- The `Fn` suffix of the function types (`FileAccessFn`, ...), a TypeScript convention.

**Effort**: S to M, mechanical: the renames, the migration notes, the samples, the scaffold templates, the generated client and the skill. In phase 3 with the
other convention changes, so the config keys are renamed once together with D11.

### D24. Response compression — **decided: `@fastify/compress`, global config and a per-route switch**

**Need**: compressed responses, switched on and tuned in the config, overridden per route, without blocking the event
loop.

**Decision**: register `@fastify/compress` in `createServer`. A custom worker-thread compressor is **rejected**: E15 shows
the plugin already compresses large payloads and streams in the libuv thread pool, and small ones synchronously in
microseconds, which is faster than handing them to any thread.

**Config** (`server.compression`, sizes with the `Size` type of D11):

| Key               | Default                 | Meaning                                                                                   |
|-------------------|-------------------------|-------------------------------------------------------------------------------------------|
| `enabled`         | `true`                  | Off when a reverse proxy or a CDN compresses already (documented)                         |
| `threshold`       | `'1KB'`                 | Smaller responses are sent as they are                                                    |
| `encodings`       | `['zstd', 'gzip']`      | In the server's order of preference, among those the client accepts; `br` and `deflate` opt-in (brotli is half as fast, E15) |
| `levels`          | `{ zstd: 3, gzip: 6, br: 4 }` | The level of each encoding                                                          |
| `syncThreshold`   | the plugin's (by cores) | Responses up to it are compressed on the event loop; to set for a container under one CPU  |
| `respectNoTransform` | `true`               | A response with `Cache-Control: no-transform` is never compressed                         |

The compressible content types are the plugin's (`mime-db`), so images, videos and archives are never compressed again.

**Per route**: a `compress` option, `false` or `{ threshold?, encodings?, levels? }` merged over the config:

```ts
createRoutes({
  modelName: 'Post',
  defaults: { compress: { threshold: '4KB' } },   // every route of the model
  export: { compress: true },                     // the CSV export, streamed and compressed in the thread pool
  find: { compress: false }
});

registerRoute((router) => router.get('/report', { config: { compress: false } }, handler));
```

`RouteConfig` gets the option, `registerRoute` and the resource routes map it onto the `compress` route option the plugin
reads.

**Off by the framework**:

- The Server-Sent Events of `@appweaver/realtime` and of the MCP endpoint: they are written to the raw response with
  `Cache-Control: no-transform`, which the plugin does not touch; their routes also set `compress: false`, so a future
  change cannot buffer a stream. The WebSocket keeps its own `permessage-deflate` setting.
- The authentication routes (`/auth/*`, the account, 2FA and MCP OAuth routes), whose bodies hold tokens: compressing a
  secret beside reflected input enables the BREACH attack over HTTPS, so they default to `compress: false`.
- The health routes, which stay under the threshold anyway.

**With the response cache (D7)**: the cache stores the uncompressed payload and a cached reply is compressed again on
every hit (`content-encoding` is not among the replayed headers). Phase 6 measures storing one compressed variant per
negotiated encoding instead (V3-PERF-10), since a hot cached route would otherwise pay the compression on every hit.

**Thread pool**: documented, with `UV_THREADPOOL_SIZE` (read once at process start, so set in the environment or by
`weaver start` from `server.threadPoolSize`, optional) for an API compressing large responses while hashing passwords.

**Effort**: S to M, about 2 days: the plugin and its config section, the route option in `createRoutes` and
`registerRoute`, the exclusions, tests (encodings, threshold, per-route override, SSE untouched, cache replay compressed,
CSV export streamed), the config examples, the skill and a load scenario with compression on.

### D21. Other decisions

| Topic                                         | Decision                                                                                     |
|-----------------------------------------------|----------------------------------------------------------------------------------------------|
| OAuth2 providers as one record                | **Rejected**: nine near-identical sections, but each carries its URLs and defaults; churn without gain |
| Merging the small driver packages             | **Rejected**: each isolates a heavy dependency (`sharp`, `nodemailer`, ...)                  |
| Node engine                                   | Keep `>= 24.7`                                                                               |
| `generate-api-key`                            | Replace with `node:crypto` (F35)                                                             |
| Atomic write operations                       | `increment` / `decrement` of numeric fields in the update input, allowed per field and view (D1) |
| SQLite in production                          | Supported, documented as single-instance with the event loop caveat (F23); `server.requestTimeout` added; PostgreSQL recommended beyond it |
| Comments                                      | Keep the JSDoc of the public API; remove comments restating the code and history notes; no ratio target |
| Samples                                       | Keep all nine (decided), more may come for other use cases; fix `cms-api` (F4) and use it as the showcase of views (D1)                   |

---

## 6. Phases and stages

| Phase | Name                          | Output                                                                    | Gate                                                  |
|-------|-------------------------------|---------------------------------------------------------------------------|-------------------------------------------------------|
| 0     | Preparation                   | Migration guide, load-test harness, baselines            | Baselines of every sample recorded                    |
| 1     | Security fixes and audit      | 2.10.1 (released) for F1-F4, F7, F9; per-module findings                  | Register reviewed, CRs ordered                        |
| 2     | Toolchain and platform        | TypeScript 7.1, `tsx`, tooling package, TypeBox 1, skill package          | CI green, samples and scaffolds build |
| 3     | Conventions and defaults      | Durations, exposure, maintenance jobs, secure defaults, query defaults    | Conventions applied in every package                  |
| 4     | Data model and API design     | Views, `extend*`, cache scopes, audit, forced 2FA                         | Each RFC approved before its code                     |
| 5     | Module-by-module              | The remaining approved CRs, in the order of section 7                     | Per module                                            |
| 6     | Performance                   | Projection, counts, aggregates, FTS, idle, all databases and samples      | Budgets met or explained                              |
| 7     | AI workflow, docs, migration  | Skill, AGENTS.md, CLI aids, docs site, migration guide                    | Docs and samples on v3                                |
| 8     | Release                       | The Release workflow run once on `main`: `3.0.0`                          | Samples and every module combination run on it        |

**Order**: security first (it ships to 2.x users), then the toolchain (every later pull request runs on it), then the
conventions (the features adopt them), then the design work, then performance against the final design.

**Pre-release for development**: **TypeScript 7.1** (the release shipping the compiler API) is scheduled as stable in
the coming weeks. Phase 2 does not wait for it: it moves the phase branches to the latest TypeScript `7.1.0-beta`, pinned
to an exact version, for development only. Prisma stays on 7.x (D16). No CR of phases 3 to 8
is merged before phase 2, so nothing is written twice against the old toolchain. The stable TypeScript 7.1 is a gate of the
release (section 10): the phases may merge into `main` on the beta, 3.0.0 is never released on it. A pre-release bump is
a CR of its own, with its upgrade notes applied.

### Phase 0: Preparation (no behavior change)

| Step | CR          | Work                                                                                                   |
|------|-------------|--------------------------------------------------------------------------------------------------------|
| 0.1  | V3-PROC-01  | The stacked phase branches and pull requests (section 2); no change to `release.config.js`             |
| 0.2  | V3-PROC-02  | `MIGRATION-v3.md` skeleton, one section per breaking CR                                                |
| 0.3  | V3-PERF-01  | `tools/load/`: the seeder (10k, 100k, 1M rows per model shape), the scenarios of E2, autocannon, a JSON report; a `npm run load -- <sample>` entry |
| 0.4  | V3-PERF-01  | Baselines of every sample on its own database (PostgreSQL, MySQL, SQL Server, SQLite, libsql on Bun), with Docker; recorded in this file |
| 0.5  | V3-PERF-02  | `tools/load/probe.js`: timer wake-ups and memory of an idle application (E5), heap snapshot diff after a soak |
| 0.6  | V3-TOOL-00  | `knip` (unused exports, files, dependencies) and `osv-scanner` as non-blocking CI jobs                  |

**Gate 0**: the numbers of every sample recorded; the harness reviewed.

**Done** on `v3/phase-0-preparation` (pull request into `main`), one commit per CR. Deviations from the steps above:
`npm run check:unused` (knip) is a blocking check like `check:circular`, at the maintainer's request, its findings
(F56) resolved in the same commit; osv-scanner stays non-blocking. `npm run load:summary` prints the tables below
from the JSON reports of `reports/load`.

#### Phase 0 baselines (step 0.4)

**Environment**: 4 vCPU (Xeon 2.3 GHz), 16 GB, Node 24.22.3, Bun 1.4.4, Docker 29 with the images of the compose
files of the samples (TimescaleDB 2.31 on PostgreSQL 18, `timescaledb-ha` with PostGIS, MariaDB 11.4, SQL Server
2022, Redis 7.4), `main` at 2.10.1 with the BullMQ shutdown fix of phase 1 (V3-BUG-02, which only changes the
shutdown). Each sample was set up with `npm run load -- <sample> --setup`, started with `NODE_ENV=prod` and the rate
limiter off, and loaded for 10 s per scenario: at 10k rows with 20 connections, then at 100k rows with 1 connection
(the latency of one request) and 20. The rows are those of the main model of the sample (`seed` of
`tools/load/samples/<sample>.js`); every request carries a random value, so the response cache answers only
`query-cached` (on the routes declaring a cache: not those of `helpdesk-api`, `inbox-processor` and
`vehicle-tracking-api`). The probe ran on the 100k database: 60 s of idle, then 60 s of soak with 10 connections.
The numbers of `cms-api` differ from E2: since 2.10.1 its anonymous reads see the published posts only, with the
`(status, createdAt, id)` index.

##### `cms-api` (sqlite, node)

| Scenario                | 10k, 20 conn.: req/s, p50, p99 | 100k, 1 conn.: req/s, p50, p99 | 100k, 20 conn.: req/s, p50, p99 |
|-------------------------|--------------------------------|--------------------------------|---------------------------------|
| `find`                  | 594.4, 29 ms, 67 ms            | 314.2, 2 ms, 16 ms             | 599, 28 ms, 71 ms               |
| `query-count`           | 114.3, 166 ms, 280 ms          | 10.4, 98 ms, 127 ms            | 8.2, 1664 ms, 6927 ms           |
| `query`                 | 194.6, 95 ms, 186 ms           | 145.2, 6 ms, 17 ms             | 201.3, 91 ms, 184 ms            |
| `query-deep-page`       | 162.8, 118 ms, 224 ms          | 13.8, 78 ms, 121 ms            | 12.8, 1503 ms, 2351 ms          |
| `query-filter-sort`     | 178.2, 105 ms, 168 ms          | 127.1, 6 ms, 20 ms             | 180, 101 ms, 704 ms             |
| `query-text-search`     | 107.4, 180 ms, 328 ms          | 6.9, 139 ms, 214 ms            | 6.1, 2751 ms, 3558 ms           |
| `query-relation-filter` | 154.3, 123 ms, 250 ms          | 104.9, 8 ms, 24 ms             | 120.2, 137 ms, 1553 ms          |
| `query-cached`          | 1,280.8, 11 ms, 44 ms          | 809.9, 0 ms, 15 ms             | 1,493.7, 9 ms, 36 ms            |
| `aggregate-year`        | 48.8, 394 ms, 507 ms           | 3.2, 300 ms, 377 ms            | 3.2, 4705 ms, 7036 ms           |

##### `helpdesk-api` (mysql, node)

| Scenario            | 10k, 20 conn.: req/s, p50, p99 | 100k, 1 conn.: req/s, p50, p99 | 100k, 20 conn.: req/s, p50, p99 |
|---------------------|--------------------------------|--------------------------------|---------------------------------|
| `find`              | 567.2, 34 ms, 58 ms            | 370.1, 2 ms, 6 ms              | 801.1, 24 ms, 44 ms             |
| `query-count`       | 173, 110 ms, 180 ms            | 17.9, 52 ms, 86 ms             | 71.7, 276 ms, 367 ms            |
| `query`             | 199.7, 95 ms, 163 ms           | 22.4, 41 ms, 63 ms             | 89.6, 212 ms, 403 ms            |
| `query-deep-page`   | 134.6, 142 ms, 274 ms          | 4.4, 221 ms, 358 ms            | 16.1, 1193 ms, 2074 ms          |
| `query-filter-sort` | 209.8, 88 ms, 164 ms           | 149.6, 6 ms, 13 ms             | 212.2, 84 ms, 165 ms            |
| `query-text-search` | 383.5, 50 ms, 83 ms            | 13.9, 68 ms, 109 ms            | 55.4, 377 ms, 511 ms            |
| `query-cached`      | 225.7, 85 ms, 136 ms           | 24.6, 37 ms, 61 ms             | 74.7, 227 ms, 842 ms            |
| `aggregate-year`    | 119.8, 164 ms, 241 ms          | 3.9, 242 ms, 300 ms            | 12.7, 1467 ms, 2029 ms          |

##### `hr-api` (sqlserver, node)

| Scenario            | 10k, 20 conn.: req/s, p50, p99 | 100k, 1 conn.: req/s, p50, p99 | 100k, 20 conn.: req/s, p50, p99 |
|---------------------|--------------------------------|--------------------------------|---------------------------------|
| `find`              | 198.4, 94 ms, 239 ms           | 129, 7 ms, 16 ms               | 245.2, 78 ms, 127 ms            |
| `query-count`       | 112.9, 171 ms, 253 ms          | 21.6, 44 ms, 68 ms             | 69.6, 286 ms, 421 ms            |
| `query`             | 120.8, 161 ms, 250 ms          | 89, 10 ms, 18 ms               | 112.9, 168 ms, 252 ms           |
| `query-deep-page`   | 51.5, 374 ms, 614 ms           | 2.5, 413 ms, 684 ms            | 6.1, 2550 ms, 5282 ms           |
| `query-filter-sort` | 111.3, 171 ms, 456 ms          | 14, 66 ms, 114 ms              | 44.1, 398 ms, 1290 ms           |
| `query-text-search` | 71.8, 262 ms, 444 ms           | 2.3, 400 ms, 574 ms            | 9.1, 1848 ms, 3470 ms           |
| `query-cached`      | 1,966.8, 8 ms, 22 ms           | 1,334.4, 0 ms, 1 ms            | 1,659.7, 9 ms, 21 ms            |
| `aggregate-year`    | 89.4, 219 ms, 301 ms           | 2.7, 363 ms, 447 ms            | 12.3, 1490 ms, 1974 ms          |

##### `inbox-processor` (sqlite, node)

| Scenario            | 10k, 20 conn.: req/s, p50, p99 | 100k, 1 conn.: req/s, p50, p99 | 100k, 20 conn.: req/s, p50, p99  |
|---------------------|--------------------------------|--------------------------------|----------------------------------|
| `find`              | 2,237, 7 ms, 22 ms             | 1,717.4, 0 ms, 1 ms            | 2,369.5, 7 ms, 18 ms             |
| `query-count`       | 272.4, 69 ms, 149 ms           | 31.1, 31 ms, 47 ms             | 34.5, 532 ms, 3998 ms            |
| `query`             | 357, 51 ms, 122 ms             | 57, 16 ms, 27 ms               | 59, 301 ms, 2234 ms              |
| `query-deep-page`   | 77.8, 229 ms, 1035 ms          | 3.3, 286 ms, 499 ms            | 3.3, 1427 ms, 7975 ms            |
| `query-filter-sort` | 442.6, 39 ms, 87 ms            | 67.3, 14 ms, 23 ms             | 25, 237 ms, 8547 ms              |
| `query-text-search` | 323.4, 58 ms, 123 ms           | 36.8, 26 ms, 38 ms             | 32.5, 534 ms, 4539 ms            |
| `query-cached`      | 409.3, 45 ms, 97 ms            | 62.7, 15 ms, 21 ms             | 61.6, 272 ms, 1836 ms            |
| `aggregate-year`    | 42.6, 397 ms, 3021 ms          | 3.4, 287 ms, 345 ms            | 3, 1638 ms, 9942 ms, 12 timeouts |

##### `movies-api-bun` (sqlite (libsql), bun)

| Scenario                | 10k, 20 conn.: req/s, p50, p99 | 100k, 1 conn.: req/s, p50, p99 | 100k, 20 conn.: req/s, p50, p99 |
|-------------------------|--------------------------------|--------------------------------|---------------------------------|
| `find`                  | 630, 29 ms, 56 ms              | 546.6, 1 ms, 5 ms              | 614.3, 30 ms, 64 ms             |
| `query-count`           | 80.1, 241 ms, 336 ms           | 15.3, 64 ms, 87 ms             | 13.8, 1438 ms, 1510 ms          |
| `query`                 | 107.8, 176 ms, 314 ms          | 19.5, 50 ms, 73 ms             | 16.7, 1025 ms, 2420 ms          |
| `query-deep-page`       | 41.9, 463 ms, 638 ms           | 4.2, 260 ms, 374 ms            | 3.2, 5198 ms, 7300 ms           |
| `query-filter-sort`     | 232.6, 82 ms, 158 ms           | 236.4, 3 ms, 10 ms             | 152.4, 76 ms, 4231 ms           |
| `query-text-search`     | 241, 80 ms, 154 ms             | 30.4, 32 ms, 46 ms             | 33.7, 579 ms, 663 ms            |
| `query-relation-filter` | 106.7, 180 ms, 275 ms          | 14.2, 67 ms, 104 ms            | 13.7, 1351 ms, 1933 ms          |
| `query-cached`          | 3,371.1, 5 ms, 13 ms           | 2,204.4, 0 ms, 0 ms            | 2,668.9, 5 ms, 15 ms            |
| `aggregate-year`        | 36.5, 535 ms, 683 ms           | 3.8, 261 ms, 318 ms            | 3.9, 4960 ms, 5183 ms           |

##### `vehicle-tracking-api` (postgresql, node)

| Scenario            | 10k, 20 conn.: req/s, p50, p99 | 100k, 1 conn.: req/s, p50, p99 | 100k, 20 conn.: req/s, p50, p99 |
|---------------------|--------------------------------|--------------------------------|---------------------------------|
| `find`              | 1,044.3, 17 ms, 36 ms          | 397.2, 2 ms, 5 ms              | 892.3, 21 ms, 37 ms             |
| `query-count`       | 243.7, 79 ms, 125 ms           | 21.6, 45 ms, 57 ms             | 62.1, 314 ms, 461 ms            |
| `query`             | 302.9, 62 ms, 109 ms           | 37.1, 25 ms, 34 ms             | 73.1, 265 ms, 439 ms            |
| `query-deep-page`   | 256.8, 74 ms, 122 ms           | 12.9, 81 ms, 147 ms            | 39.1, 509 ms, 851 ms            |
| `query-filter-sort` | 332.9, 59 ms, 93 ms            | 89.1, 10 ms, 17 ms             | 260.5, 72 ms, 154 ms            |
| `query-cached`      | 299.7, 64 ms, 105 ms           | 34.5, 28 ms, 38 ms             | 71.4, 273 ms, 458 ms            |
| `aggregate-year`    | 260.9, 74 ms, 127 ms           | 12.9, 72 ms, 112 ms            | 61.9, 321 ms, 448 ms            |
| `query-near`        | 237.4, 78 ms, 143 ms           | 32.3, 29 ms, 54 ms             | 119.3, 159 ms, 423 ms           |
| `query-within-box`  | 299.4, 64 ms, 100 ms           | 85.5, 11 ms, 19 ms             | 286.1, 67 ms, 113 ms            |

##### `webshop-api` (postgresql, node)

| Scenario            | 10k, 20 conn.: req/s, p50, p99 | 100k, 1 conn.: req/s, p50, p99 | 100k, 20 conn.: req/s, p50, p99 |
|---------------------|--------------------------------|--------------------------------|---------------------------------|
| `find`              | 646.2, 29 ms, 58 ms            | 204, 4 ms, 8 ms                | 825.3, 23 ms, 39 ms             |
| `query-count`       | 246, 78 ms, 143 ms             | 23.4, 40 ms, 73 ms             | 91.6, 217 ms, 298 ms            |
| `query`             | 333.8, 57 ms, 100 ms           | 133.7, 7 ms, 12 ms             | 294.2, 64 ms, 138 ms            |
| `query-deep-page`   | 257.6, 75 ms, 128 ms           | 10, 107 ms, 134 ms             | 34.2, 591 ms, 928 ms            |
| `query-filter-sort` | 314.2, 60 ms, 103 ms           | 139.5, 6 ms, 11 ms             | 277.2, 67 ms, 124 ms            |
| `query-text-search` | 153.5, 127 ms, 205 ms          | 8.7, 113 ms, 138 ms            | 12.5, 1527 ms, 2531 ms          |
| `query-cached`      | 3,059.9, 6 ms, 12 ms           | 1,200.9, 0 ms, 1 ms            | 3,603.6, 4 ms, 10 ms            |
| `aggregate-year`    | 213.6, 90 ms, 141 ms           | 9.2, 107 ms, 144 ms            | 38, 528 ms, 688 ms              |

| Sample                 | Ready | RSS / heap after startup | Wake-ups in 60 s of idle (by origin)                 | Soak: heap, RSS                   |
|------------------------|-------|--------------------------|------------------------------------------------------|-----------------------------------|
| `cms-api`              | 2.8 s | 448 MB / 118 MB          | 13 (bullmq 10, node 2, cron 1)                       | 113 MB → 121 MB, 651 MB → 1398 MB |
| `helpdesk-api`         | 2.3 s | 346 MB / 83 MB           | 102360 (@appweaver/core 102238, mariadb 120, node 2) | 79 MB → 82 MB, 494 MB → 837 MB    |
| `hr-api`               | 2.3 s | 403 MB / 100 MB          | 52766 (@appweaver/core 52745, tarn 19, node 2)       | 98 MB → 146 MB, 577 MB → 1080 MB  |
| `inbox-processor`      | 1.3 s | 235 MB / 56 MB           | 12 (bullmq 10, node 2)                               | 49 MB → 51 MB, 347 MB → 656 MB    |
| `reports-worker`       | 0.5 s | 136 MB / 29 MB           | 2 (node 2)                                           | -                                 |
| `vehicle-tracking-api` | 2.3 s | 394 MB / 93 MB           | 4 (node 2, cron 1, pg-pool 1)                        | 88 MB → 93 MB, 527 MB → 1038 MB   |
| `webshop-api`          | 3.6 s | 423 MB / 109 MB          | 42 (bullmq 40, node 2)                               | 103 MB → 108 MB, 593 MB → 1096 MB |

**What they show**

- **The total count**, at 100k with one connection, divides the throughput of the first page by 4 to 14
  (`cms-api` 145 → 10 req/s, `webshop-api` 134 → 23, `hr-api` 89 → 22): the default of D10.
- **Offset pages** fall to 2.5 to 13 req/s at 100k on every database; SQL Server is the slowest (413 ms for one
  request), then MySQL.
- **Text search** (`contains`) costs 100 to 400 ms per request at 100k everywhere: F24.
- **SQLite under concurrency**: with 20 connections every slow scenario of `cms-api`, `inbox-processor` and
  `movies-api-bun` stalls the others (p99 of 4 to 10 s, `inbox-processor` timing out on `aggregate-year`), where the
  database servers keep their p99 under 1 s for the same scenarios except the deep page and the text search: F23.
- **`aggregate`** of one year: 3 to 4 req/s on SQLite, 3 to 13 on the servers at one connection: F20.
- **Spatial**: `_withinBox` (the bounding box index) answers 85 req/s, `_near` 32 req/s at 100k alerts with one
  connection, both on PostGIS.
- **Idle**: the in-process queue of `helpdesk-api` and `hr-api` ran 900 to 1,700 timer callbacks a second while idle
  (F58, fixed in phase 1); BullMQ wakes up 10 times a minute per worker (8 lock extensions, 2 stalled checks), so 42 for
  the 4 queues of `webshop-api`; the audit flush is silent since 2.10.1.
- **Memory**: 136 MB (`reports-worker`) to 448 MB (`cms-api`) of RSS after startup, 29 to 118 MB of heap; the RSS
  doubles under the soak (a high-water mark), the heap grows by 2 to 8 MB, except `hr-api` (98 → 146 MB in 60 s),
  to follow up with a longer soak in phase 6.


### Phase 1: Security fixes and audit

**Stage 1a: patches for 2.10.x** (P0, released before any v3 work lands). **Released in v2.10.1**: the
`fix/security-and-query-limits` branch ([lmatosevic/appweaver#49](https://github.com/lmatosevic/appweaver/pull/49), 10
commits, merged as `bed401b`), with `@fastify/static` 10.1.12 (`1af4c5a`) and the sample migrations regenerated into one
`init` migration each, the `cms-api` listing index included (`73742c2`). Every test, lint and check passed (315 suites,
4,896 tests, 89.1% branch coverage), and the `cms-api` e2e suite as on 2.10.0 (see F40). Verified on the running sample
at 100k posts:

| Probe (E2, E10, E11)                                   | 2.10.0                         | The branch                               |
|--------------------------------------------------------|--------------------------------|------------------------------------------|
| 7.9 MB filter of 300k conditions                       | server frozen 19.5 s, then 500 | `400 RESOURCE_FILTER_TOO_COMPLEX` in 0.16 s, others served at once |
| 12 MB JSON body                                        | parsed                         | `413` in 3 ms                            |
| Filter or sort on `author.email` (relation-omitted)    | an oracle (103,666 vs 0)       | `400`                                    |
| Anonymous query of the drafts                          | drafts with their content      | none                                     |
| Cached query from a second CORS origin                 | the first origin's header      | its own origin                           |
| `projectVirtualFields` share of the CPU of a query     | ~6%                            | 0.2%                                     |
| Anonymous listing (`query` without the count)          | 211 req/s (every post)         | 296 req/s (published only, with the new `(status, createdAt, id)` index; 7 req/s without it) |
| Audit flush wake-ups in 60 s of idle                   | 60                             | 0                                        |

Deviations from the stage as planned: the JSON body limit defaults to `10M` in 2.x (`1M` stays the v3 default of D5),
F37 is left to phase 3, and V3-BUG-01 became a fix rather than a warning: `define` already warned about a duplicate
name, the loader was what kept the other definition.

| CR           | Fix                                                                                                    |
|--------------|--------------------------------------------------------------------------------------------------------|
| V3-SEC-01    | Filter limits (`maxConditions`, `maxDepth`, `maxListValues`) with a `400 RESOURCE_FILTER_TOO_COMPLEX`; a JSON body limit separate from the upload limit (keeping `100M` for multipart in 2.x); `data` reading a web key fixed (F37) |
| V3-SEC-02    | The filter and sort schemas of a relation leave out the fields of its `output.omit`                    |
| V3-SEC-03    | The cache stores an allow list of headers                                                              |
| V3-SEC-04    | CSV formula escaping (`=`, `+`, `-`, `@`, tab, carriage return prefixed with `'`), the array join bug  |
| V3-SAMPLE-01 | `cms-api`: anonymous reads restricted to published posts, the view count moved off the read path      |
| V3-BUG-01    | The loader keeps the definition the context holds (the context already warned about a duplicate name) |
| V3-PERF-03a  | The related models of the projection resolved once per model (part of V3-PERF-03)                     |
| V3-PERF-06a  | The audit flush timer runs only while entries are buffered (part of V3-PERF-06)                        |

**Stage 1b: read-only review**, every package through the checklist of section 7, in its order. Findings go into the
register (section 4) and become CRs. Specific items:

- The security checklist: access (every route has auth and a policy; `include` of a related model honors its policy;
  counts and aggregates honor `readRestrictions`; MCP tools and realtime events run as the user); input (mass
  assignment, prototype pollution in config merge, JSON fields and query parsing, ReDoS in `_like`/regex filters);
  tokens (JWT algorithm pinning, secret length, refresh rotation, one-time tokens single-use with constant-time
  comparison, TOTP replay window, a password reset revoking sessions); OAuth2 and MCP OAuth (state, PKCE, redirect
  allow list, F8: `email_verified` of every provider); files (path traversal, content sniffing, `sharp`
  `limitInputPixels`, signed URL scope); outbound (SSRF through AI endpoints and `weaver-client generate <url>`);
  output (template escaping, internals in problem details, secrets in logs); realtime (ticket single use, origin,
  per-connection limits, slow consumers); abuse (rate limits of auth, export, aggregate, bulk, MCP and AI calls).
- The edge cases, each with a test (V3-QA-01): two updates of one record (lost update; `If-Match` with `updatedAt`),
  unique constraint races, bulk partial failures and the 5 s bulk transaction at 1k items, deleting a user owning
  records, a role in use, relations to soft-deleted records, restoring a soft-deleted record whose unique value is
  taken, a stable order on ties, case-insensitive search per database, `null` versus missing versus empty string,
  dates and time zones, decimals and big integers in JSON, `in` lists beyond 2,100 values on SQL Server, interrupted
  uploads, a storage write succeeding while the database write fails, a role change or disabling while tokens live,
  refresh token reuse, TOTP clock skew, a job retried after partial side effects, a job scheduled on every instance,
  `SIGTERM` during a transaction, an export or a stream, migrations while old instances run, a missing secret in
  production, cache invalidation across instances, unicode file names, out-of-order time series points, geometries
  across the antimeridian.
- V3-QA-02: every test running a command that installs packages passes an explicit `cwd` (F32).

**Gate 1**: the register reviewed, every CR approved, rejected or deferred, and ordered.

### Phase 2: Toolchain and platform

| Step | CR          | Work                                                                                                    |
|------|-------------|---------------------------------------------------------------------------------------------------------|
**Entry**: phase 1 closed. TypeScript on the latest `7.1.0-beta`, pinned exactly (see "Pre-release for development"
above). Prisma on the latest 7.x.

| Step | CR          | Work                                                                                                    |
|------|-------------|---------------------------------------------------------------------------------------------------------|
| 2.1  | V3-TOOL-02  | Tool check on the TypeScript 7.1 beta: typescript-eslint, `openapi-typescript`, `typebox-codegen`, madge; a tool not ready keeps an aliased `typescript@6` (D12) |
| 2.2  | V3-TOOL-01  | TypeScript 7.1 everywhere: `baseUrl` removed, `types` and `typeRoots` listed, decorator flags removed, the client's CommonJS build off `node10`, the `WebSocket.send` typing, `noImplicitAny: true` (108 fixes) |
| 2.3  | V3-TOOL-03  | `ts-node` replaced by `tsx` in `cli/utils/loader-util.ts`                                               |
| 2.4  | V3-TOOL-06  | TypeBox 1.x everywhere, one copy; `typebox-codegen` replaced if it cannot follow                        |
| 2.5  | V3-TOOL-05  | `@appweaver/tooling` (ESLint 10, Prettier, Jest + SWC configs), `weaver lint|format|test`, the scaffold templates on it |
| 2.6  | V3-TOOL-08  | `@appweaver/skill` and `weaver skill sync`                                                              |
| 2.7  | V3-SEC-06   | `generate-api-key` replaced; `npm audit` triaged (the `effect` advisory comes with Prisma 7's `@prisma/config`) |

**Gate 2**: CI green on the TypeScript 7.1 beta and Prisma 7, its duration compared to E1 (target: the x4.7 build of E6), every
sample and every scaffold combination building and passing its e2e tests on its database.

### Phase 3: Conventions and defaults

| Step | CR          | Work                                                                                                    |
|------|-------------|---------------------------------------------------------------------------------------------------------|
| 3.1  | V3-CONV-01  | `Duration` and `Size` types on every duration and size key, the units out of the key names             |
| 3.2  | V3-CONV-02  | `actions` on REST, events and MCP; the bulk flags removed; `weaver routes`                              |
| 3.3  | V3-CONV-03  | The maintenance job registry, locks, `maintenance.*`, batched deletes                                   |
| 3.4  | V3-CONV-04  | The defaults table of D5                                                                                |
| 3.5  | V3-CONV-05  | `database.keepTables`                                                                                   |
| 3.6  | V3-CONV-06  | `totalCount` default and bounded count, `maxOffset`                                                     |
| 3.7  | V3-CONV-07  | `aggregate` in one `GROUP BY`, no implicit 7-day window                                                 |
| 3.8  | V3-COMMON-01 | Array env values: a JSON array accepted, anything ambiguous rejected                                   |
| 3.9  | V3-CONV-08  | Full names instead of abbreviations (D23), a clean switch without aliases                              |

**Gate 3**: every package on the conventions; `MIGRATION-v3.md` covers each change.

### Phase 4: Data model and API design

Each item starts with an RFC section in this file (the API, the merge and composition rules, the generated types, the
OpenAPI output, the migration), approved before its code.

| Step | CR          | Work                                                                                                    |
|------|-------------|---------------------------------------------------------------------------------------------------------|
| 4.1  | V3-DATA-01  | `extendModel`, `extendService`, `extendPolicy`, `extendRoutes`; duplicates fail                         |
| 4.2  | V3-DATA-02  | Views: model, routes (registry keyed by model and view), policies, relations, MCP, events, export, filters limited to the view, generated types and client |
| 4.3  | V3-DATA-03  | `increment` / `decrement` write operations                                                              |
| 4.4  | V3-DATA-04  | Framework models: optional audit routes, the ApiKey policy without `user!`                              |
| 4.5  | V3-DATA-05  | Audit off the hot path (D8)                                                                             |
| 4.6  | V3-WEB-01   | Cache scopes (D7)                                                                                       |
| 4.7  | V3-WEB-02   | Forced 2FA lifecycle (D6)                                                                               |
| 4.7b | V3-WEB-03   | Remembered 2FA devices (D6b), with V3-WEB-02                                                            |
| 4.8  | V3-DATA-07  | SQL migration layer (D22), with `weaver migrate`, `weaver test setup|reset` and `weaver migration reset` |
| 4.9  | V3-DATA-08  | Index options and generated fields in the model (D22 C), after V3-DATA-07                               |
| 4.10 | V3-WEB-04   | Response compression (D24): `server.compression`, the `compress` route option, the exclusions         |

**Gate 4**: `cms-api` rewritten on views and `extend*` as the showcase; the samples and the scaffolds on the new APIs.

### Phase 5: Module-by-module

The approved CRs of phase 1b and section 7, package by package. **Gate 5** per package: the checklist of section 7
ticked.

### Phase 6: Performance

| Step | CR          | Work                                                                         | Target (SQLite 100k unless noted)           |
|------|-------------|------------------------------------------------------------------------------|---------------------------------------------|
| 6.1  | V3-PERF-03  | Projection compiled once per model and view, one pass per record             | `projectVirtualFields` out of the top 20 functions |
| 6.2  | V3-PERF-04  | The find+count `$transaction` measured and dropped where it only adds cost; bounded count | `query` with count < 15 ms     |
| 6.3  | V3-PERF-05  | Full-text search mode; relation filter SQL and the indexes of implicit many-to-many tables | text search < 20 ms with FTS     |
| 6.4  | V3-PERF-06  | Timers only while there is work; bounded collections                         | 0 wake-ups in 60 s of idle from the framework |
| 6.5  | V3-PERF-07  | `server.requestTimeout`; SQLite production guidance                          | documented                                  |
| 6.6  | V3-PERF-08  | Idle heap broken down (heap snapshot), duplicated schemas removed            | idle heap -30% (from 119 MB)                |
| 6.7  | V3-PERF-09  | Every sample's scenario on its own database, against phase 0                 | no regression; budgets per scenario         |
| 6.8  | V3-PERF-10  | Cached responses stored compressed, one variant per negotiated encoding (D24) | the cached scenario of E2 compressed within 10% of uncompressed |

**Gate 6**: the budgets met or each miss explained in this file.

### Phase 7: AI workflow, docs and migration

| Step | CR          | Work                                                                                                    |
|------|-------------|---------------------------------------------------------------------------------------------------------|
| 7.1  | V3-DOC-02   | `SKILL.md` < 5k tokens; the references split per module; `configuration.md` generated from the schema |
| 7.2  | V3-DOC-03   | `AGENTS.md` < 8k tokens; details in `docs/contributing/*.md`                                            |
| 7.3  | V3-DOC-04   | Agent benchmark: fixed tasks on a scaffolded project (a model with relations and routes, a view, a role and its policy, a maintenance job, a realtime channel, an MCP tool), counting turns, tokens and errors, before and after |
| 7.4  | V3-CLI-02..04 | `weaver doctor`, `weaver resource new`, `--json` output                                               |
| 7.5  | V3-DOC-05   | `MIGRATION-v3.md` complete: every breaking change with its before and after; `weaver upgrade` unchanged (versions and skill files) |
| 7.6  | V3-DOC-01   | Comments cleanup, package by package                                                                    |

### Phase 8: Release — see section 10.

---

## 7. Module-by-module plan

**Checklist of every package** (phase 1b and gate 5)

- [ ] **Purpose**: does it belong here, should it be merged, split or removed?
- [ ] **Public API**: exports, entry points, names, unused exports (knip), types
- [ ] **Config**: keys, production-safe defaults (D5), units (D11), docs and examples
- [ ] **Errors**: codes, details, HTTP mapping, actionable messages
- [ ] **Security**: the checklist of phase 1b
- [ ] **Performance and idle cost**: hot paths, allocations, timers, unbounded collections
- [ ] **Edge cases**: the list of phase 1b that applies
- [ ] **Tests**: uncovered branches, contract suites, missing scenarios
- [ ] **Comments and dead code**
- [ ] **Docs**: skill reference, docs site, samples

**Order**: `common`, `core`, `data`, `web`, `realtime`, `mcp`, `ai` and `openai`, the drivers, `opentelemetry`,
`testing`, `cli`, `create`, `client`, the skill and docs, the samples, the tools and CI.

### `common` (9,790 lines, 32% comments, 58 `any`)

- Confirmed: F36 (array env values), the `Duration`/`Size` types land here (D11), `@appweaver/common` takes 285 ms to
  load (E5): find what loads eagerly.
- Review: the config flattening (`splitRecordEntry`) and the JSON/env precedence; `ErrorCode` size and naming;
  `types/` readability (model, routes, policy) since views and `actions` reshape them; what belongs to `core` instead.
- CRs: V3-COMMON-01, V3-CONV-01, V3-SEC-06.

### `core` (7,374 lines, 17%, 9 `any`)

- Confirmed: F9 (`define` keeps the first definition while loaders keep the last), the maintenance registry lands here
  (D9).
- Review: the DI container and the frozen context; lifecycle order and shutdown; provider selection (is loading a class
  by module path still needed?); `MemoryQueue` polling; `JobResults` waiters; `Events` versus `PubSub` naming; the
  memory security store bounds; `CacheService` key building.
- CRs: V3-CONV-03, V3-DATA-01 (registry side), V3-PERF-06.

### `data` (17,594 lines, 18%, 211 `any`, 67 implicit)

- Confirmed: F2, F7, F9, F10, F16, F19, F20, F21, F25, F26, F37; the `ApiKey` policy `user!`.
- Review: `ResourceService` (1,723 lines: transactions, orphans, soft delete, the projection passes); query cost
  (include depth, counts, `_some`); seeders; export streaming at 100k; spatial engines; time series retention; the 211
  explicit `any`.
- CRs: V3-SEC-02, V3-SEC-04, V3-DATA-01..05, V3-CONV-05..07, V3-PERF-03..05.

### `web` (14,252 lines, 14%, 69 `any`)

- Confirmed: F1, F3, F5, F6, F11, F12, F15, F22, F38.
- Review: the OpenAPI document size; JWT (`findById` of the user on every request, its cache), OAuth2 providers (F8),
  basic auth, captchas; the account flows; problem details in production; the health routes; the cost of the audit
  and telemetry hooks; file and series routes.
- CRs: V3-SEC-01, V3-SEC-03, V3-SEC-05, V3-CONV-02, V3-CONV-04, V3-WEB-01, V3-WEB-02.

### `realtime` (6,024 lines, 17%, 1 `any`)

- Facts: streams, actions, channels and resource events are used by `movies-api-bun` only.
- Review: memory per connection; the access query per event and distinct subscribed user, measured at 1k
  connections; draining; SSE and WebSocket parity; views for events (D1).
- Not removing features without usage data; the realtime scenario of phase 6 decides.

### `mcp` (2,356 lines, 11%, 4 `any`)

- Confirmed: F28.
- Review: OAuth sign-in (`iss`), destructive gating, tool schema size for agents (views), the read-only tool cache
  (`user` scope), rate limits.
- CRs: V3-MCP-01.

### `ai` and `openai` (3,507 lines)

- Review: 18 presets to maintain (`ai/driver/presets.ts`): are they current; alias fallback; the stream relay of the
  queue; tool loop limits; cost controls (token budgets per user and per endpoint); a driver for a non-OpenAI-compatible
  API only on demand.

### Drivers (`redis`, `bullmq`, `cron`, `nodemailer`, `twilio`, `handlebars`, `sharp`)

- Covered by their contract suites. Review: Redis circuit breaker and reconnection; BullMQ idle timers (E5: 10
  wake-ups a minute) and lock settings; `twilio` timeouts; `handlebars` escaping; `sharp` `limitInputPixels`; the
  maintenance lock on Redis (D9).

### `opentelemetry` (780 lines)

- Review: zero overhead when disabled (measured), semantic convention versions, the log bridge cost.

### `testing` (1,588 lines)

- Review: the contract suites under Jest (D14), `createDatabaseStub` fidelity, a contract for the maintenance jobs.

### `cli` (5,621 lines, 15%, 11 `any`)

- Confirmed: F29.
- CRs: V3-TOOL-03, V3-CLI-01 (`weaver routes`), V3-CLI-02 (`doctor`), V3-CLI-03 (`resource new`), V3-CLI-04 (`--json`),
  V3-CLI-06 (`migration new --create-only` and `--sql`); `weaver upgrade` keeps its scope (versions and skill files).

### `create` (3,513 lines)

- Review: the cost of the module combination tests; templates in sync with the samples; the tooling package (D15);
  the Bun variants; views and `actions` in the templates.

### `client` (7,320 lines, 22%, 56 `any`)

- Confirmed: F33.
- CRs: V3-CLIENT-01..03 (D19). Review: `FetchClient` token refresh races, `RealtimeClient` reconnection, the Angular
  client and the untyped client (`--no-types`), both kept (decided).

### Skill and docs

- Confirmed: F34. CRs: V3-TOOL-08, V3-DOC-02, V3-DOC-03, V3-DOC-04.

### Samples

- Confirmed: F4. Every sample gets a load scenario (phase 0) and moves to views and `actions` (phase 4).

### Tools and CI

- CI duration compared at gate 2; nightly load tests (never per pull request); the 4 GB lint heap of `tools/lint.js`
  re-measured under ESLint 10 and TypeScript 7.1; `tools/copy-packages.js` and the sample lockfiles under the new
  toolchain.

---

## 8. Change request register

All `proposed` until approved, except V3-SEC-01 to V3-SEC-04, V3-SAMPLE-01 and V3-BUG-01, **released in v2.10.1**
(phase 1a), with parts of V3-PERF-03 and V3-PERF-06. Effort: S < 1 day, M days, L a
week, XL more.

| ID            | Title                                                                    | Phase | Prio | Effort | Breaking       |
|---------------|--------------------------------------------------------------------------|-------|------|--------|----------------|
| V3-PROC-01    | Stacked phase pull requests into `main` (section 2)                     | 0     | P1   | S      | No             |
| V3-PROC-02    | `MIGRATION-v3.md`                                                        | 0     | P1   | S      | No             |
| V3-PERF-01    | Load-test harness and baselines of every sample                          | 0     | P1   | M      | No             |
| V3-PERF-02    | Idle and memory probe, soak test                                         | 0     | P1   | S      | No             |
| V3-TOOL-00    | `knip` and `osv-scanner` in CI                                           | 0     | P2   | S      | No             |
| V3-SEC-01     | Filter complexity limits, JSON body limit (F1, F37)                      | 1     | P0   | M      | 2.x: no; v3 defaults |
| V3-SEC-02     | Relation `output.omit` fields not filterable (F2)                        | 1     | P0   | S      | Rejects such filters |
| V3-SEC-03     | Cached responses replay only allowed headers (F3)                        | 1     | P0   | S      | No             |
| V3-SEC-04     | CSV formula escaping, array join (F7)                                    | 1     | P0   | S      | No             |
| V3-SAMPLE-01  | `cms-api`: published posts only, no write on read (F4)                   | 1     | P0   | S      | Sample only    |
| V3-BUG-01     | The loader follows the context's definitions (F9)                        | 1     | P1   | S      | No             |
| V3-SEC-05     | OAuth providers: `email_verified` everywhere (F8)                        | 1     | P1   | S      | Maybe          |
| V3-SEC-07     | Findings of the security checklist, one CR each                          | 1     | -    | -      | Per finding    |
| V3-QA-01      | Edge case suite                                                          | 1     | P1   | L      | Per finding    |
| V3-QA-02      | Tests never install packages in the repository (F32)                     | 1     | P1   | S      | No             |
| V3-QA-03      | The two failing `cms-api` 2FA e2e tests (F40)                            | 1     | P1   | S      | No             |
| V3-SAMPLE-02  | Query plans of every sample's policies checked by the load scenarios (F41) | 6   | P2   | S      | No             |
| V3-TOOL-01    | TypeScript 7.1, config cleanup, `noImplicitAny` (F30, F31)               | 2     | P1   | M      | Projects       |
| V3-TOOL-02    | Tool check on TypeScript 7.1, aliased `typescript@6` where needed        | 2     | P1   | S      | No             |
| V3-TOOL-03    | `tsx` instead of `ts-node` (F29)                                         | 2     | P1   | S      | No             |
| V3-TOOL-05    | `@appweaver/tooling`, `weaver lint|format|test`, ESLint 10               | 2     | P1   | M      | Projects       |
| V3-TOOL-06    | TypeBox 1.x (F27)                                                        | 2     | P1   | L      | Yes            |
| V3-TOOL-08    | `@appweaver/skill`, `weaver skill sync`                                  | 2     | P1   | M      | No             |
| V3-SEC-06     | `generate-api-key` replaced, audit triage (F35)                          | 2     | P2   | S      | No             |
| V3-CONV-01    | `Duration` and `Size` (F17)                                              | 3     | P1   | L      | Yes            |
| V3-CONV-02    | `actions` everywhere, bulk flags removed, `weaver routes` (F14)          | 3     | P1   | M      | Yes            |
| V3-CONV-03    | Maintenance job registry (F16)                                           | 3     | P1   | M      | Yes (keys)     |
| V3-CONV-04    | Secure defaults (F5, F6, F11, F38)                                       | 3     | P1   | M      | Yes            |
| V3-CONV-05    | `database.keepTables` (F18)                                              | 3     | P2   | S      | Yes            |
| V3-CONV-06    | `totalCount` default, bounded count, `maxOffset` (F19)                   | 3     | P1   | S      | Yes            |
| V3-CONV-07    | `aggregate` in one `GROUP BY`, no implicit window (F20)                  | 3     | P1   | M      | Yes            |
| V3-CONV-08    | Full names: `geo` to `spatial`, `2fa` to `twoFactor`, `OTT`, `SEP`, CLI aliases (D23, F45) | 3 | P1 | M | Yes |
| V3-COMMON-01  | Array env values (F36)                                                   | 3     | P2   | S      | No             |
| V3-DATA-01    | `extend*`, duplicates fail (F9)                                          | 4     | P1   | L      | Duplicates fail |
| V3-DATA-02    | Model views (F13, F2)                                                    | 4     | P1   | XL     | No (additive)  |
| V3-DATA-03    | `increment` / `decrement`                                                | 4     | P1   | M      | No             |
| V3-DATA-04    | Framework models: audit routes, ApiKey policy                            | 4     | P2   | S      | No             |
| V3-DATA-05    | Audit off the hot path (F25, F26)                                        | 4     | P1   | M      | No             |
| V3-DATA-07    | SQL migration layer: `database/sql`, per-database variants, repeatable files, `SqlMigration` tracking, module SQL, drop guard (D22, F42) | 4 | P1 | L | No (additive) |
| V3-DATA-08    | Index `type`/`ops`/`where`/expression and generated fields in the model (D22 C) | 4 | P2 | M | No |
| V3-CLI-06     | `weaver migration new --create-only` (D22 A; also a 2.x minor)           | 1     | P2   | S      | No             |
| V3-DATA-06    | A system context for the application's own calls, distinct from anonymous (F39) | 4 | P1 | M      | Yes            |
| V3-WEB-01     | Cache scopes, key once, JSON storage (F15, F22)                          | 4     | P1   | M      | Yes (config)   |
| V3-WEB-02     | Forced 2FA lifecycle (F12)                                               | 4     | P1   | L      | Yes            |
| V3-WEB-03     | Remembered 2FA devices, opt-in (D6b)                                     | 4     | P1   | M      | No (additive)  |
| V3-WEB-04     | Response compression, global config and per route (D24, E15)             | 4     | P1   | S      | No (additive)  |
| V3-MCP-01     | MCP 2026-07-28 (F28)                                                     | 5     | P1   | M      | No             |
| V3-CLI-01     | `weaver routes`                                                          | 3     | P1   | S      | No             |
| V3-CLI-02     | `weaver doctor`                                                          | 7     | P2   | M      | No             |
| V3-CLI-03     | `weaver resource new`                                                    | 7     | P2   | M      | No             |
| V3-CLI-04     | `--json` output                                                          | 7     | P2   | S      | No             |
| V3-CLIENT-01  | Types in their own file by default                                       | 5     | P1   | S      | Yes            |
| V3-CLIENT-02  | Used or omitted operations, inapplicable ones dropped                    | 5     | P1   | S      | No             |
| V3-CLIENT-03  | Generic resource types, comments opt-in, < 3,500 lines                   | 5     | P1   | M      | Maybe          |
| V3-PERF-03    | Compiled projection (F21)                                                | 6     | P1   | M      | No             |
| V3-PERF-04    | The find+count transaction measured, dropped where it only adds cost     | 6     | P1   | S      | No             |
| V3-PERF-05    | Full-text search mode, relation filter (F24)                             | 6     | P2   | L      | No             |
| V3-PERF-06    | Timers only while working, bounded collections                           | 6     | P1   | M      | No             |
| V3-PERF-07    | `server.requestTimeout`, SQLite guidance (F23)                           | 6     | P1   | S      | No             |
| V3-PERF-08    | Idle heap reduction                                                      | 6     | P2   | M      | No             |
| V3-PERF-09    | All samples on their databases against phase 0                           | 6     | P1   | M      | No             |
| V3-PERF-10    | Compressed variants in the response cache (D24)                          | 6     | P2   | S      | No             |
| V3-DOC-01     | Comments and dead code                                                   | 7     | P2   | M      | No             |
| V3-DOC-02     | Skill under 5k tokens, generated configuration reference                 | 7     | P1   | M      | No             |
| V3-DOC-03     | `AGENTS.md` under 8k tokens                                              | 7     | P1   | S      | No             |
| V3-DOC-04     | Agent benchmark                                                          | 7     | P2   | M      | No             |
| V3-DOC-05     | Migration guide, every breaking change with its before and after         | 7     | P1   | M      | No             |

---

## 9. Decisions left to the maintainer

All decided (revision 13):

1. **2.x support**: none after 3.0.0; v3 replaces 2.x as the latest release, and 2.x receives no more fixes.
2. **Defaults of D5**: access tokens short-lived (15 minutes) and refreshed regularly (30-day rotating refresh tokens);
   `totalCount` off by default, the client asking for it on its first page only; Swagger UI **stays on** in every
   environment, a production deployment turning it off with `swagger.enabled: false` (documented).
3. **TypeScript 7.1 slip**: 3.0.0 is held until TypeScript 7.1 is stable, a milestone of the release.
4. **Samples**: all nine stay; more may be added for other use cases.
5. **Angular client and untyped client** (`--no-types`): both kept.
6. **Views naming**: `views` on the model and `view` on the routes, policies, relations, MCP and events (D1).
7. **SQL migration file names** (D22): the `<version>_<name>.<database>.sql` suffix, `<database>` a value of the
   `DatabaseType` enum (`sqlite`, `postgresql`, `mysql`, `sqlserver`).
8. **Prisma 8 and SQL Server**: Prisma 7 as used so far, no Prisma 8 plans (D16, revision 7).
9. **Name of the spatial model key**: `spatial` (D23, revision 10).
10. **2.x release of phase 1a**: released as v2.10.1 (revision 12).

---

## 10. Release plan

1. Every phase merged into `main` through its stacked pull request; every phase gate passed.
2. **TypeScript 7.1.0 stable** replacing the beta development ran on (the release waits for it, decision 3), Prisma on
   the latest 7.x; the full test suite, the samples' e2e suites, a scaffolded project of every module combination and
   the load tests rerun on `main`, the load-test budgets met.
3. `MIGRATION-v3.md` complete; `weaver upgrade --target-version 3` bumps the packages and the skill files, and the user
   applies the migration guide.
4. docs.appweaver.co on v3, the v2 docs kept under a versioned path.
5. The Release workflow run on `main`: `3.0.0`, the latest release; no 2.x maintenance (decision 1), a 2.x fix if ever
   needed branching from the `v2.10.1` tag.
