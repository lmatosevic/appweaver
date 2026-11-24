# Appweaver v3.0.0 Plan

> **Status**: draft for review, refined phase by phase. **Baseline**: v2.10.0 (`main` at `f26fc6b`).
> Nothing is implemented before its phase plan is reviewed and its change requests are approved.

## Contents

1. [Goals and principles](#1-goals-and-principles)
2. [Process](#2-process)
3. [Baseline: what we already know](#3-baseline-what-we-already-know)
4. [Phases](#4-phases)
5. [Themes](#5-themes)
6. [Module-by-module review](#6-module-by-module-review)
7. [Change request register](#7-change-request-register)
8. [Open decisions](#8-open-decisions)
9. [Release plan](#9-release-plan)

---

## 1. Goals and principles

**Goals**

- **Sanity check** every package, feature, interface and use case: does it make sense, is it complete, is it needed.
- **Consistency**: one way to do each thing (defaults, units, config, naming, extension points).
- **Performance**: fast on realistic data (10k to 100k records), cheap when idle, no memory growth.
- **Security**: secure by default, every module reviewed.
- **AI agent workflow**: fewer tokens, fewer steps and fewer wrong turns for an agent building an application.

**Principles**

- **Brutal honesty**: every proposal states its cost, its risk and the "leave it as is" option. A change has to beat
  doing nothing, and a proposal can be rejected.
- **Remove and simplify first**: adding an option needs a use case from a sample or a real application.
- **Breaking changes are allowed**, but each one gets a migration note, and a `weaver upgrade` step or codemod when it
  is mechanical.
- **Measure before optimizing**: the v2.10.0 numbers are recorded before any performance change.
- **Small steps**: one concern per change request, reviewed and merged one at a time.

---

## 2. Process

Every phase runs in three stages, each ending with a review:

1. **Phase plan**: the phase is detailed module by module in this file, every finding with its evidence
   (`file:line`) and a proposed change request (CR). Each CR is approved, rejected or deferred.
2. **Implementation**: one branch and pull request per CR (or per small group of tightly related CRs), named after the
   work (`refactor/duration-config`), with conventional commits (`feat!:` or a `BREAKING CHANGE` footer when breaking).
3. **Phase review**: tests, lint, circular check and the load-test baseline rerun; skill, docs and migration guide
   updated; the phase is closed.

**Change request format**

| Field      | Content                                                                    |
|------------|----------------------------------------------------------------------------|
| ID         | `V3-<AREA>-<nn>`, e.g. `V3-CORE-03`                                        |
| Problem    | What is wrong or missing, with evidence                                    |
| Proposal   | The change, and the alternatives considered                                |
| Do nothing | What happens if we skip it                                                 |
| Breaking   | Yes or no, who is affected, the migration step                             |
| Effort     | S, M or L                                                                  |
| Status     | `proposed`, `approved`, `rejected`, `deferred`, `in progress` or `done`    |

**Definition of done** of a CR: branch coverage kept at 80% or more, `format:check`, `lint` and `check:circular`
passing, `skill/` updated, config examples updated (`appweaver.example.json`, `.env.example`, `configuration.md`),
samples and scaffold templates updated, a note in `MIGRATION-v3.md` when breaking, docs.appweaver.co updated.

---

## 3. Baseline: what we already know

**Size** (source lines without tests, comments included / test files):

| Package    | Lines  | Tests | Package         | Lines | Tests |
|------------|--------|-------|-----------------|-------|-------|
| `data`     | 17,594 | 55    | `testing`       | 1,588 | 2     |
| `web`      | 14,252 | 65    | `opentelemetry` | 780   | 6     |
| `common`   | 9,790  | 27    | `redis`         | 606   | 7     |
| `core`     | 7,374  | 38    | `bullmq`        | 557   | 2     |
| `client`   | 7,320  | 19    | `handlebars`    | 532   | 3     |
| `realtime` | 6,024  | 21    | `openai`        | 522   | 2     |
| `cli`      | 5,621  | 24    | `twilio`        | 202   | 2     |
| `create`   | 3,513  | 13    | `cron`          | 183   | 2     |
| `ai`       | 2,985  | 11    | `nodemailer`    | 106   | 2     |
| `mcp`      | 2,356  | 10    | `sharp`         | 87    | 1     |

About 82k source lines and 312 test files in total.

**Findings so far**, checked while writing this plan. Each one becomes a CR or is rejected in its phase.

| #  | Finding                                                                                                                                                                         | Evidence                                                                                                                                                                                                                                          |
|----|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1  | Three time-unit conventions in the config: integer milliseconds (most TTLs), integer seconds, and duration strings                                                              | `core/cache/cache-config.ts:20` (`DEFAULT_TTL: 5000` ms), `web/security/security-config.ts:161` (`EXPIRES_IN: 604800` s), `core/queue/queue-config.ts:8` (`KEEP_COMPLETED_SECONDS`), `data/audit/audit-config.ts:12` (`RETENTION: '90d'`), `web/server/server-config.ts:33` (`STATIC_MAX_AGE: '30d'`) |
| 2  | The maintenance jobs are `setInterval` timers in every instance, outside the scheduler, without a lock: N instances run N purges                                                | `data/audit/audit-service.ts:111,129`, `data/timeseries/database-time-series.ts:116`, `data/storage/file-service.ts:140`                                                                                                                          |
| 3  | Each surface has its own exposure default: CRUD routes on (opt out with `exclude`), bulk routes off (env flags `RESOURCE_BULK_*_ENABLED` or `exclude: false`), realtime events and MCP tools off (opt in) | `common/types/routes.ts:238-256`                                                                                                                                                                                                                  |
| 4  | The response cache of an authenticated route is keyed per user: a cached read is shared only by `public` routes                                                                 | `web/cache/caching.ts:31`                                                                                                                                                                                                                         |
| 5  | The audit fields `createdAt`, `updatedAt` and `createdById` are in every response by default, so `createdById` exposes user IDs                                                 | `data/factory/create-model.ts` (`buildAuditSchema`)                                                                                                                                                                                               |
| 6  | The access token lives 7 days by default (`604800` s), the refresh token 60 days                                                                                                | `web/security/security-config.ts:161-163`                                                                                                                                                                                                         |
| 7  | Forced 2FA is one global switch falling back to `Email`: no per-role enforcement, no enrolment grace period                                                                     | `web/security/security-config.ts:49`                                                                                                                                                                                                              |
| 8  | Field visibility is static per model (`hidden`, the `omit` of `create` and `update`). Policies restrict rows (`readRestrictions`), never fields per role or permission        | `common/types/model.ts`, `common/types/policy.ts`                                                                                                                                                                                                 |
| 9  | Two patterns for the framework models: `ApiKey` ships its model, service, policy and routes (switched by config), `AuditLog` and `AuditChange` only their models              | `web/security/resources/api-key/routes.ts`, `skill/references/audit.md`                                                                                                                                                                           |
| 10 | Four separate `KEEP_DATABASE_TABLE` keys (API keys, connected accounts, 2FA, security store) plus the audit one                                                                 | `data/security/auth-config.ts:25,43,49`, `core/security/security-store-config.ts:9`, `data/audit/audit-config.ts:9`                                                                                                                               |
| 11 | The audit diff is computed in the request (`recordChange`), only the write is deferred; the flush timer wakes every second, idle or not                                        | `data/audit/audit-service.ts:111,209-247`                                                                                                                                                                                                         |
| 12 | The generated client of `movies-api-bun` is 7,425 lines, and every resource client lists its omitted operations, never the used ones                                           | `client/generators/generate-client.ts:171`                                                                                                                                                                                                        |
| 13 | `experimentalDecorators` and `emitDecoratorMetadata` are on, while no package uses decorators; the `paths` rely on `baseUrl`, deprecated by TypeScript 6                        | `tsconfig.json`                                                                                                                                                                                                                                   |
| 14 | The tests run on Jest 30 through `@swc/jest`, the only use of SWC; scaffolded projects ship the same setup                                                                      | `jest.config.json`, `scaffoldDependencies.tooling`                                                                                                                                                                                                |
| 15 | The CLI carries `ts-node`, `tsc-watch` and `tsc-alias` as runtime dependencies                                                                                                  | `packages/cli/package.json`                                                                                                                                                                                                                       |
| 16 | About 15k of the 82k source lines are comment lines (~18%)                                                                                                                      | line count over `packages/**/*.ts` without tests                                                                                                                                                                                                  |
| 17 | The skill is ~12.8k lines (`SKILL.md`, `GUIDELINES.md`, 25 references), copied into projects by `weaver upgrade`                                                                | `cli/upgrade/upgrade-skill.ts`                                                                                                                                                                                                                    |
| 18 | Releases come from `main` only, so breaking commits cannot be staged in prereleases                                                                                             | `release.config.js:30`                                                                                                                                                                                                                            |
| 19 | A realtime resource event costs one access query per event and distinct subscribed user                                                                                         | `AGENTS.md` (`packages/realtime`)                                                                                                                                                                                                                 |

---

## 4. Phases

| Phase | Name                          | Output                                                                   | Gate                                              |
|-------|-------------------------------|--------------------------------------------------------------------------|---------------------------------------------------|
| 0     | Preparation                   | Release channel, migration guide skeleton, load-test harness, baselines  | Baseline numbers recorded                         |
| 1     | Audit (read-only)             | Findings and CRs per module: security, edge cases, API, comments         | CR register reviewed and ordered                  |
| 2     | Toolchain and platform        | TypeScript, test runner, lint tooling, Prisma 8, skill package           | CI green, samples and scaffolds build             |
| 3     | Conventions and foundations   | Durations, exposure defaults, maintenance jobs, secure defaults          | Conventions applied in every package              |
| 4     | Data model and API design     | Model extension, model views, auth by extension, caching, audit          | Each RFC approved before its code                 |
| 5     | Module-by-module refactoring  | The remaining approved CRs, in the order of section 6                    | Per module                                        |
| 6     | Performance                   | Load tests at 10k and 100k records, every sample, idle and memory        | Budgets met or explained                          |
| 7     | AI workflow, docs, migration  | Skill, AGENTS.md, CLI aids, docs site, migration guide, codemods         | Docs and samples on v3                            |
| 8     | Release                       | `3.0.0-next.N` prereleases, then `3.0.0`                                 | Samples and a scaffolded project run on the release |

**Why this order**: the audit is cheap and feeds every later phase. The toolchain goes early so every later pull
request runs on it. Conventions come before features, so the features adopt them. Performance is optimized after the
design changes, but measured in phase 0, so the comparison is fair.

### Phase 0: Preparation (no behavior change)

- **0.1** A `next` branch as a semantic-release prerelease channel (`3.0.0-next.N` on the `next` dist-tag); 2.x fixes
  stay on `main` and are merged forward.
- **0.2** `MIGRATION-v3.md` skeleton.
- **0.3** Load-test harness (see [5.21](#521-performance-and-load-tests)): seeders of 10k and 100k records, the
  scenarios, the database matrix of the samples' `docker-compose.yml`. Record the v2.10.0 numbers.
- **0.4** Idle and memory baseline: heap, RSS and event-loop wake-ups of an idle sample over 30 minutes, and after a
  soak of 1M requests.
- **0.5** Analysis tools: `knip` (unused exports, files and dependencies), `npm audit` or `osv-scanner`.

### Phase 1: Audit (read-only)

Every package goes through the checklist of section 6, in its order. The findings and CRs are written into section 6
under the package. Tests reproducing a bug are welcome; a critical or high security bug is fixed at once in a 2.x
patch release.

- **1.1** Security review ([5.6](#56-security-review))
- **1.2** Edge cases ([5.7](#57-edge-cases))
- **1.3** API surface and consistency ([5.22](#522-consistency-sweep))
- **1.4** Comments, dead code and docs accuracy ([5.19](#519-comments-dead-code-and-code-size))

### Phases 2 to 8

Detailed in this file when the previous phase closes. Their content is the themes of section 5.

---

## 5. Themes

Each theme lists the goal, the current state, the questions to answer, and an initial recommendation to be challenged
in review.

### 5.1 Extending and overriding framework models

**Goal**: change a model of the framework or of a module (the auth model, `ApiKey`, `File`, `AuditLog`, `AuditChange`,
`Role`, `Permission`, ...) without copying it: add scalars, relations, indexes, virtual fields, the `export` or audit
config, override the options of one field, and leave everything else as the framework defines it, still receiving its
updates.

**Questions**

- Merge semantics: a deep merge per field? May a field be removed, and never a field the framework relies on?
- Declaration: `extendModel('ApiKey', { ... })` in the resources of the application, discovered like a model, applied
  before `weaver generate` writes the Prisma schema and the types.
- Typing: the generated types and the `ResourceRegistry` reflect the extension.
- Services, policies and routes the same way: a service subclass under the same token, a policy composed with the
  framework one, the routes overridden per action.
- Auth: replace building an auth model from scratch (`createAuthModel`) with a default `User` model, service, policy
  and routes the application extends. Is a custom name (`Employee` in `hr-api`) still supported?

**Initial recommendation**: one `extend*` mechanism, merged field by field, rejecting the removal of a field the
framework needs. An added field must be optional or have a default, since the framework creates these records itself.
Policies compose (both must allow), so an extension cannot loosen a framework guard by accident.

### 5.2 Model views: input and output per role

**Goal**: one model, several API shapes. A `Post` with a `public` view (the published fields, no audit fields, the only
write being the increment of `viewCount`) and an `admin` view (every field, every write), each with its policy and
routes.

**Current state**: finding 8, the visibility of a field is the same for every user.

**Options**

- **A. Keep as is**, plus a field mask in the policy removing fields at runtime per user. Cheap, but the OpenAPI
  document cannot tell (every maskable field becomes optional), the generated clients lose precision, and the cache key
  has to include the mask.
- **B. Static views** (`views` of `createModel`, or `createModelView`): each view picks or omits the output fields and
  the input fields, and the allowed write operations (`increment`), with its own policy and routes
  (`createRoutes({ modelName: 'Post', view: 'public' })`). The schemas stay static, so the OpenAPI document, the
  clients, the serialization, the cache and the MCP tools stay precise.
- **C. One route choosing the view per request by role**: the response schema becomes a union. Bad for clients,
  caching and serialization. Rejected.

**Initial recommendation**: B, as an addition: a model without views works as today. The runtime mask of A only if a
real use case needs it, and only removing fields. Side benefit: the MCP tools and the realtime events can bind a slim
view, so an agent reads fewer tokens.

**Questions**: is a view a type of its own in the generated types and the `ResourceService`? Are the events projected
per view? Do the atomic writes (`increment`) exist today, or are they part of this work?

### 5.3 Exposure defaults: REST, bulk, events and MCP

**Goal**: one rule for what a model exposes, the same on every surface (finding 3).

**Options**

- **a. Everything opt-in**: `createRoutes` exposes nothing unless listed. Safest, verbose, breaks every application.
- **b. CRUD on, everything else opt-in**, with the same selection syntax on every surface, and the bulk routes switched
  in code instead of env flags.
- **c. Presets** (`rest: 'crud' | 'read' | 'none'`) with per-surface overrides.

**Initial recommendation**: b with the presets of c. Exposure is code, not config, so the `RESOURCE_BULK_*_ENABLED`
flags go. Add `weaver routes`, listing every route, event and tool of every model, so a human or an agent can check the
exposed surface.

### 5.4 Secure and realistic defaults

Every default is reviewed as if the application went to production unchanged. The output is a table of the key, its
current default, the proposed one and the reason. Known candidates:

- **Audit fields hidden by default** (finding 5), shown per model or view.
- **Token lifetimes** (finding 6): an access token of minutes with a rotating refresh token, and reuse detection.
- **Forced 2FA lifecycle** (finding 7):
    - the first login of a user without a method: enrolment flow, verified email or phone needed, the method when the
      mailer or the SMS sender is disabled (fail at startup?)
    - an enrolment grace period, forcing per role (`forcedRoles`), recovery codes issued at enrolment
    - an admin reset of a user's methods, a remembered device
    - API keys, OAuth2 logins and the MCP sign-in under forced 2FA
- **Others**: email verification before login, password policy, auth rate limits on by default, CORS, Swagger UI off
  in production, problem details without internals in production, body size, maximum page size, filter and include
  depth limits.

### 5.5 Framework-owned models: ApiKey versus the audit log

**Question from the task**: hand the `ApiKey` routes, service and policy over to the application, like the audit log?

**Honest assessment**: no for `ApiKey`. Its invariants (a key never grants more than its owner holds, only a JWT
session manages keys) are security-critical and easy to get wrong in application code; moving them out turns a
framework guarantee into documentation. The inconsistency (finding 9) is real, but better solved the other way: every
framework model ships its model, service, policy and routes (the audit routes off by default, read-only, admin only),
and the application customizes them through [5.1](#51-extending-and-overriding-framework-models). Decided together
with 5.1 and 5.3. Finding 10 (the `KEEP_DATABASE_TABLE` keys) is unified in the same CR.

### 5.6 Security review

The checklist every module goes through in phase 1. Each finding is rated critical, high, medium or low.

- **Access**: every route has authentication and a policy; an `include` of a related model honors that model's policy;
  filtering, sorting or aggregating on a hidden or restricted field cannot leak it (oracle); counts and aggregates
  honor `readRestrictions`; MCP tools and realtime events run as the user.
- **Input**: mass assignment, prototype pollution (config merge, JSON fields, query parsing), ReDoS in filters, deep
  JSON and large arrays.
- **Tokens**: JWT algorithm pinning and secret length, refresh rotation, one-time tokens single use with constant-time
  comparison, TOTP replay window, a password reset or change revoking the sessions.
- **OAuth2 and MCP OAuth**: state, PKCE, redirect URI allow list, account takeover through an unverified provider email.
- **Files**: path traversal of the `local` storage, content sniffing versus the declared type, size limits, image
  decompression bombs (`sharp` pixel limit), signed URL scope and lifetime.
- **Outbound**: SSRF through the AI endpoints, `weaver-client generate <url>` and any fetched URL.
- **Output**: CSV injection in the export, template escaping (pages and emails), internals in problem details, secrets
  in logs (`isSecretName`).
- **Realtime**: ticket lifetime and single use, origin check, per-connection limits, memory of slow consumers.
- **Supply chain**: dependency audit, `allowScripts`, `--ignore-scripts` of `weaver module add`, pinned versions.
- **Abuse**: rate limits of the auth routes, export, aggregate, bulk, MCP tool calls and AI calls (cost).

### 5.7 Edge cases

The common real-life cases, each verified with a test:

- **Concurrency**: two updates of one record (lost update: optimistic locking, `If-Match`?), unique constraint races,
  bulk partial failures and the 5 s bulk transaction timeout at 1k items.
- **Deletes**: a user owning records (`createdById`), a role in use, relations to soft-deleted records, restoring a
  soft-deleted record whose unique value is taken.
- **Pagination**: page size caps, deep offsets at 100k records, the cost of the total count, a stable order on ties
  (an `id` tie-breaker, or rows skip or repeat between pages).
- **Filters per database**: case-insensitive search (collations of SQLite and MySQL versus PostgreSQL), `null` versus
  missing versus empty string, dates and time zones, decimals and big integers in JSON, long `in` lists (the 2,100
  parameter limit of SQL Server).
- **Files**: an upload interrupted midway, the same file uploaded twice at once, a storage write succeeding while the
  database write fails.
- **Auth**: a role change or a disabling while tokens live, refresh token reuse, TOTP clock skew, forced 2FA for a user
  without email or phone.
- **Jobs**: a retry after partial side effects (idempotency), a worker crash, a job scheduled on every instance.
- **Lifecycle**: `SIGTERM` during a transaction, an export or a stream; migrations while old instances run; a missing
  secret in production failing fast.
- **Multi-instance**: cache invalidation across instances, realtime events.
- **Data**: unicode in file names and search, out-of-order and duplicate time series points, geometries across the
  antimeridian and invalid geometries.

### 5.8 Caching of resource reads

**Goal**: a cached read shared by every user where it is safe, enforced to return the same data whoever asks.

**Current state**: finding 4, the hit ratio of an authenticated route is per user.

**Proposal**: `cache: { scope: 'shared' }`, accepted only when the response of the route cannot depend on the user: no
`readRestrictions` for the action, no user-dependent virtual field, no view mask. Checked at startup, failing
otherwise, and the response computed without the user. A later `scope: 'access'` would key on the roles and
permissions the policy reads instead of the user, but only if policies declare what they read; without that it is
unsafe, so it is deferred.

**Also review**: the invalidation strategy (`ExpireRelated`), stampede protection (single flight), the memory bounds of
the cache, and the Redis memory of per-user keys.

### 5.9 Audit log off the hot path

**Goal**: the audit log adds no latency to a request; it is an aftereffect.

**To verify**: what runs during the request (the diff of `recordChange`, finding 11, and the entry of the request in
`onResponse`), measured with the audit on and off.

**Candidates**: compute the diff at flush time from the two snapshots; a bounded buffer with a dropped-entries metric;
flush through the queue when there is one; start the flush timer on the first entry instead of every second; the cost
of a bulk update of 1k records.

**Acceptance**: the p95 latency with the audit on stays within a few percent of the audit off, at 100k records.

### 5.10 Maintenance and scheduled jobs

**Current state**: finding 2. Inventory every periodic job: audit retention, time series retention (`database`
driver), file version pruning, expired one-time tokens and security store entries, queue job cleanup, and any other.

**Proposal**: a registry of maintenance jobs, each with a name, a default schedule and a handler. A job runs on the
`Scheduler` when one is enabled, else on a timer; with a `Queue`, it is enqueued with a deduplication ID, so one
instance runs it; `weaver run maintenance:<job>` runs it once (a Kubernetes cron job or a worker process); a switch
turns maintenance off on the API instances. One section, `maintenance.<job>.enabled` and `.schedule`, replaces the
per-feature `*_WORKER`, `*_INTERVAL` and `PRUNE_INTERVAL` keys. Large deletes run in batches, so they never hold long
locks at 100k rows.

**Honest assessment**: with one instance, today's timers work. The problem is N instances (N purges and their lock
contention) and no visibility. Multi-instance is the common production setup, so it is worth doing.

### 5.11 Time units

**Current state**: finding 1, three conventions.

**Options**

- **a. Milliseconds everywhere**, as integers. Consistent, but `604800000` is unreadable.
- **b. Seconds everywhere**. Rejected: sub-second values exist (the 200 ms Redis command timeout, the coalescing and
  flush intervals of realtime).
- **c. One `Duration` type**: an integer of milliseconds or a string with a unit (`'200ms'`, `'15m'`, `'7d'`), parsed
  once when the config loads, milliseconds in the code.

**Initial recommendation**: c. The units leave the key names (`KEEP_COMPLETED_SECONDS` becomes `KEEP_COMPLETED`), the
JSON Schema accepts both forms, and the docs stop saying "in milliseconds". Open: the TOTP step, defined in seconds by
RFC 6238.

### 5.12 TypeScript 7 and the build

- **TypeScript 7** (the native compiler): build and type-check speed. Blockers to check: the tools using the
  TypeScript JS API (typescript-eslint type-aware rules, `tsc-alias`, `ts-node`, `tsc-watch`,
  `@sinclair/typebox-codegen`, `madge`). Path: TypeScript 6 first (fix its deprecations, `baseUrl` among them), then 7
  once the tools support it, or 7 for type-checking only.
- **Compiler flags**: drop `experimentalDecorators` and `emitDecoratorMetadata` (finding 13).
- **Aliases**: replace the `paths` and `tsc-alias` with package `exports` and subpath `imports`, so nothing rewrites
  the emitted JS. Affects the scaffolded projects.
- **ESM**: decide whether v3 publishes ESM (or dual). The ecosystem moves there, but the Prisma client output, the
  test runner and the dynamic loading of the CLI are affected. A spike first, no blind commitment.
- **`ts-node`**: replaceable by the type stripping of Node? The packages use `enum`s (`ErrorCode`), which plain type
  stripping does not support.
- **TypeBox**: 0.34 to 1.x? It is public API (config sections, schemas), so a major is the moment to do it.

### 5.13 Testing: Vitest instead of Jest, without SWC

**Facts**: 312 test files on Jest 30 and `@swc/jest`, the `moduleNameMapper` mapping the packages to their sources,
contract suites already runner-agnostic (Jest, Vitest, Bun), and the scaffolded projects shipping Jest and SWC.

**Options**: stay on Jest (it needs a transformer, so SWC or the slower `ts-jest` stays), or move to Vitest (TypeScript
built in, ESM ready, `resolve.alias` replacing `moduleNameMapper`, `vi` instead of `jest`, no SWC or `jest-junit`).

**Initial recommendation**: a spike on `core` and `data`, comparing the wall time, the watch mode, the coverage (v8)
and the differences of mock hoisting. Decided at gate 2. If 5.12 chooses ESM, Vitest is close to mandatory. The
scaffolded projects follow the same choice.

### 5.14 Lint, format and tooling through the CLI

**Idea**: `weaver lint`, `weaver format` and `weaver test` with configs shipped by Appweaver, so a project carries one
dev dependency instead of the ~17 packages of `scaffoldDependencies.tooling`.

**Honest assessment**: bundling ESLint and its plugins into the CLI makes it heavy and pins the lint versions of every
project to ours. A separate `@appweaver/tooling` dev dependency (the configs, with the tools as its dependencies) is
cleaner, and `weaver upgrade --tooling` already exists. Also evaluate Biome or oxlint (lint and format in one fast
tool) versus ESLint and Prettier, the type-aware rules being the deciding factor. It may also end the 4 GB heap of
`tools/lint.js`.

### 5.15 Prisma 8 and the database commands

- Read the release notes and map each breaking change to our wrappers: `weaver migrate`, `migration new|check|reset`,
  `test setup|reset`, `generate` (client output, generator), the five driver adapters, `prisma.config.ts`, the `$extends`
  extensions (telemetry, spatial), the error codes of `toDatabaseError`.
- `migrate/plan-migrations.ts` parses the output and the debug log of `prisma migrate status` (`P1003`, `P3005`,
  `P3009`): fragile. Use a structured output if Prisma 8 has one.
- Restructure the commands, e.g. `weaver db migrate|status|plan|new|check|reset|seed`.
- Recreate the databases of every sample.

### 5.16 The skill as a package

**Proposal**: `@appweaver/skill`, a dev dependency released with the framework, and `weaver skill sync` (or
`weaver upgrade`) placing it in `.claude/skills`, `.agents`, ... The scaffolded `AGENTS.md` points to it.

**Honest assessment**: for: the version always matches the installed framework, `npm update` updates it, the copy code
leaves `weaver upgrade`. Against: agents read their skills directory, not `node_modules`, so a sync step remains, and
it is one more package to release. Initial recommendation: do it, together with measuring and splitting the skill
([5.20](#520-ai-agent-workflow)).

### 5.17 Generated client

- Types and client in separate files by default.
- A resource client lists its used operations or its omitted ones, whichever list is shorter (finding 12).
- Find where the 7,425 lines of the `movies-api-bun` client come from (most likely the `openapi-typescript` paths and
  components) and shrink them: generic resource types parameterized by the model instead of per-route expansions, no
  duplicated GET and POST query variants.
- Target: about half the lines on `movies-api-bun` with the same type safety, and a measured type-check time of the
  consumer.
- Keep or drop the Angular client and the untyped client (`--no-types`)? Depends on their use.

### 5.18 Idle cost and memory leaks

- **Timers**: list every timer of an idle application (the audit flush every second, heartbeats, the polling of
  `MemoryQueue`, the ready polling of `StreamInstance`). Target: a timer runs only while there is work.
- **Unbounded collections**: the in-memory caches, rate limiters (login), realtime registries, tickets, `JobResults`
  waiters, AI streams, MCP rate limits.
- **Soak test**: an hour idle and 1M requests, heap snapshots compared. Target: no growth after warm-up.

### 5.19 Comments, dead code and code size

- Keep the JSDoc of the public API (it feeds the IDE and the docs). Remove the comments restating the code, shorten the
  long explanations to one line, remove history notes.
- `knip`: unused exports, files and dependencies.
- `AGENTS.md` and `SKILL.md` are in the context of every agent session: trim them, every line costs tokens.
- No target ratio: reviewed per module.

### 5.20 AI agent workflow

**Goal**: an agent builds a correct application in fewer tokens and turns.

- **Measure**: a fixed set of tasks on a scaffolded project (a model with relations and routes, a role with its
  policy, a scheduled job, a realtime channel, an MCP tool), counting turns, tokens and errors before and after.
- **Skill**: size, structure, loaded on demand.
- **CLI aids**: `--json` output, `weaver routes` (the exposed surface), `weaver doctor` (config, generated files and
  migrations in sync), `weaver resource new <name>` (model, service, policy, routes and test), errors naming the fix.
- **One way to do things**: every alternative removed is a wrong guess an agent cannot make.

### 5.21 Performance and load tests

- **Data**: 10k and 100k records (1M as a stretch) of each model shape: flat, with relations, with files, with time
  series, with geo fields. On SQLite, PostgreSQL, MySQL and SQL Server.
- **Scenarios**: find by ID; query with filters (equality, range, `contains`, relation filters); sort with deep offset
  pages and with a cursor; relation includes (N+1); aggregates (count, sum, group by); CSV export (memory); bulk create,
  update and delete; writes with the audit on and off; cache hits and misses; realtime fan-out to 1k connections; MCP
  tool calls; time series and spatial queries.
- **Checks**: query plans (`EXPLAIN`), indexes of the filtered and sorted fields, the cost of the total count, memory
  per request, the event access queries of finding 19.
- **Samples**: one realistic scenario per sample (the checkout of `webshop-api`, the tickets of `helpdesk-api`, the
  trips of `vehicle-tracking-api`, ...).
- **Budgets**: p50, p95 and p99 latency, throughput and RSS per scenario. Run nightly or by hand, never per pull
  request.
- **Tool**: k6 (scripted, dockerized, good reports) or autocannon (Node, simple). One of them, chosen in phase 0.

### 5.22 Consistency sweep

Config key names, error code names, logger names, the CLI conventions (already tested), OpenAPI operation IDs, event
names, MCP tool names, file names and the `exports` entry points.

---

## 6. Module-by-module review

**Checklist of every package**

- [ ] **Purpose**: does it belong here, should it be merged, split or removed?
- [ ] **Public API**: exports, entry points, names, unused exports, types
- [ ] **Config**: keys, production-safe defaults, units, docs and examples
- [ ] **Errors**: codes, details, HTTP mapping, actionable messages
- [ ] **Security**: [5.6](#56-security-review)
- [ ] **Performance and idle cost**: hot paths, allocations, timers, unbounded collections
- [ ] **Edge cases**: [5.7](#57-edge-cases)
- [ ] **Tests**: uncovered branches, contract suites, missing scenarios
- [ ] **Comments and dead code**
- [ ] **Docs**: skill reference, docs site, samples

**Review order**: `common`, `core`, `data`, `web`, `realtime`, `mcp`, `ai` and `openai`, the drivers,
`opentelemetry`, `testing`, `cli`, `create`, `client`, the skill and docs, the samples, the tools and CI.

**Initial items per package** (to be completed in phase 1)

| Package                | Items to look at                                                                                                                                                                                                                                                                                               |
|------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `common`               | The config system (flattening, `splitRecordEntry`, the JSON and env precedence), the `Duration` type, `ErrorCode` and `defineErrors`, the logger, telemetry helpers, `defineModule`; the size of `types/` (model, routes, policy) and their readability; does all of it belong in `common` (9.8k lines)?          |
| `core`                 | The DI container and the frozen context, lifecycle order and shutdown, module discovery and provider selection (is loading a class by module path still needed?), memory and cache eviction, `MemoryQueue` polling, `JobResults`, the `Events` versus `PubSub` naming, locale, health, tasks, the memory security store bounds |
| `data`                 | `ResourceService` (size, transactions, orphans, soft delete), the filter, sort and aggregate schemas, query cost (include depth, counts), `createModel` (5.1, 5.2, 5.4), the auth model, seeders, the streaming of the export, time series and file retention (5.10), spatial engines, audit (5.9), the `KEEP_DATABASE_TABLE` keys |
| `web`                  | Route registration and the size of the OpenAPI document, caching (5.8), JWT defaults, OAuth2, API keys, basic auth, captchas, 2FA (5.4), account flows, problem details, health, Swagger in production, rate limits, CORS and helmet defaults, the cost of the audit and telemetry hooks, file and series routes |
| `realtime`             | 6k lines: is every feature used (input streams, relay, coalescing, resume)? Memory per connection, the access query per event (finding 19), draining, SSE and WebSocket parity                                                                                                                                   |
| `mcp`                  | Compliance with the current protocol revision, OAuth sign-in, destructive tool gating, the size of the tool schemas for agents (views of 5.2), tool names, rate limits, the cache of the read-only tools                                                                                                        |
| `ai`, `openai`         | Driver contract, the maintenance cost of the presets, alias fallback, the stream relay of the queue, tool loop limits, cost controls (token budgets per user), drivers of non-OpenAI-compatible APIs: needed?                                                                                                    |
| Drivers                | `redis` (circuit breaker, reconnection), `bullmq`, `cron`, `nodemailer`, `twilio` (timeouts), `handlebars` (escaping), `sharp` (pixel limits): contract suites cover them; one package per heavy dependency stays, small as they are                                                                              |
| `opentelemetry`        | Zero overhead when disabled, the semantic convention versions, the cost of the log bridge                                                                                                                                                                                                                      |
| `testing`              | Helper API, the contract suites under the chosen runner, the fidelity of `createDatabaseStub`                                                                                                                                                                                                                  |
| `cli`                  | Command grouping (5.15), new commands (5.20), runtime dependencies (finding 15), `--json`, start and watch on Node and Bun, `upgrade`                                                                                                                                                                           |
| `create`               | The cost of the module combination tests, templates in sync with the samples, tooling dependencies (5.14), the Bun variants                                                                                                                                                                                    |
| `client`               | 5.17; `FetchClient` token refresh races, `RealtimeClient` reconnection, the Angular client                                                                                                                                                                                                                     |
| Skill and docs         | 5.16, 5.19, 5.20                                                                                                                                                                                                                                                                                               |
| Samples                | Nine samples to maintain: does each one still show something the others do not? A load scenario each (5.21)                                                                                                                                                                                                   |
| Tools and CI           | CI duration, nightly load tests, the 4 GB lint heap, `tools/copy-packages.js` and the sample lockfiles under the new toolchain                                                                                                                                                                                   |

---

## 7. Change request register

The initial CRs, all `proposed`. Phase 1 adds the findings of each module.

| ID            | Title                                                                    | Theme      | Phase | Breaking   |
|---------------|--------------------------------------------------------------------------|------------|-------|------------|
| V3-PROC-01    | `next` prerelease branch and channel                                     | 4          | 0     | No         |
| V3-PROC-02    | `MIGRATION-v3.md`                                                        | 9          | 0     | No         |
| V3-PERF-01    | Load-test harness and the v2.10.0 baseline                               | 5.21       | 0     | No         |
| V3-PERF-02    | Idle and memory baseline, soak test                                      | 5.18       | 0     | No         |
| V3-SEC-01     | Security review, one CR per finding                                      | 5.6        | 1     | Per finding |
| V3-QA-01      | Edge case test suite                                                     | 5.7        | 1     | Per finding |
| V3-TOOL-01    | Remove the decorator compiler flags                                      | 5.12       | 2     | No         |
| V3-TOOL-02    | TypeScript 6 deprecations, then TypeScript 7                             | 5.12       | 2     | Maybe      |
| V3-TOOL-03    | ESM decision spike                                                       | 5.12       | 2     | Maybe      |
| V3-TOOL-04    | Vitest spike and decision, SWC removal                                   | 5.13       | 2     | Projects   |
| V3-TOOL-05    | Tooling package or CLI commands for lint, format and test                | 5.14       | 2     | Projects   |
| V3-TOOL-06    | Prisma 8 and the database commands                                       | 5.15       | 2     | Yes        |
| V3-TOOL-07    | `@appweaver/skill` package                                               | 5.16       | 2     | No         |
| V3-TOOL-08    | TypeBox 1.x                                                              | 5.12       | 2     | Yes        |
| V3-CONV-01    | `Duration` config type, units out of the key names                       | 5.11       | 3     | Yes        |
| V3-CONV-02    | One exposure rule and syntax for REST, bulk, events and MCP              | 5.3        | 3     | Yes        |
| V3-CONV-03    | Maintenance jobs on the scheduler or the queue, run once per cluster     | 5.10       | 3     | Yes        |
| V3-CONV-04    | Secure defaults table and its changes                                    | 5.4        | 3     | Yes        |
| V3-CONV-05    | One key for the framework tables kept without their feature              | 5.5        | 3     | Yes        |
| V3-DATA-01    | Extending and overriding models, services, policies and routes           | 5.1        | 4     | No         |
| V3-DATA-02    | Model views                                                              | 5.2        | 4     | No         |
| V3-DATA-03    | Auth model built by extension                                            | 5.1        | 4     | Yes        |
| V3-DATA-04    | One pattern for the framework-owned models                               | 5.5        | 4     | Maybe      |
| V3-DATA-05    | Audit log off the hot path                                               | 5.9        | 4     | No         |
| V3-WEB-01     | Shared cache scope, checked at startup                                   | 5.8        | 4     | No         |
| V3-WEB-02     | Forced 2FA lifecycle: first login, per role, grace period                | 5.4        | 4     | Maybe      |
| V3-CLI-01     | `weaver routes`                                                          | 5.3, 5.20  | 5     | No         |
| V3-CLI-02     | `weaver doctor`                                                          | 5.20       | 5     | No         |
| V3-CLI-03     | `weaver resource new`                                                    | 5.20       | 5     | No         |
| V3-CLI-04     | `--json` output                                                          | 5.20       | 5     | No         |
| V3-CLIENT-01  | Types and client in separate files by default                            | 5.17       | 5     | Yes        |
| V3-CLIENT-02  | Used or omitted operations, whichever is shorter                         | 5.17       | 5     | No         |
| V3-CLIENT-03  | Halve the generated client                                               | 5.17       | 5     | Maybe      |
| V3-PERF-03    | Fixes from the load tests                                                | 5.21       | 6     | Per fix    |
| V3-PERF-04    | Timers only while there is work, bounded collections                     | 5.18       | 6     | No         |
| V3-DOC-01     | Comments and dead code, per package                                      | 5.19       | 5     | No         |
| V3-DOC-02     | Trim `AGENTS.md` and the skill, agent benchmark                          | 5.20       | 7     | No         |

---

## 8. Open decisions

1. **Release**: a `next` prerelease channel, and a `2.x` maintenance branch after 3.0.0 (for how long)?
2. **A last 2.x minor** accepting the new config keys and warning on the old ones, to ease the upgrade?
3. **Module format**: CommonJS, ESM or dual?
4. **Node**: keep `>= 24.7` or require Node 26?
5. **Exposure rule** (5.3): b with presets?
6. **Model views** (5.2): option B?
7. **Framework-owned models** (5.5): keep the ApiKey routes in the framework and add default audit routes?
8. **Durations** (5.11): option c?
9. **Test runner** (5.13): decided after the spike?
10. **Lint tooling** (5.14): separate package or CLI; ESLint and Prettier, or Biome or oxlint?
11. **Samples**: which of the nine stay?
12. **Client**: keep the Angular client and the untyped client?
13. **TypeBox 1.x** in v3?

---

## 9. Release plan

1. Every approved CR done; phase reviews closed.
2. `3.0.0-next.N` prereleases on the `next` dist-tag; the samples and a scaffolded project of every module combination
   run on them.
3. `MIGRATION-v3.md` complete, with `weaver upgrade --target-version 3` applying the mechanical steps (config key
   renames, imports).
4. docs.appweaver.co on v3, with the v2 docs kept under a versioned path.
5. `3.0.0` released from `main`; `2.x` keeps receiving security fixes for the agreed period.
