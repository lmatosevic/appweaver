# Migrating from Appweaver 2.x to 3.0

> **Status**: skeleton (phase 0, V3-PROC-02). Each section is filled by the change request (CR) it belongs to, when its
> pull request lands, with the exact before and after. A section still marked _pending_ describes a change that is
> planned, not made: nothing below applies to 2.x yet. See `PLAN-v3.md` for the decisions behind each change.

3.0 is a clean switch: the renamed or changed keys, options, routes, error codes and types have **no alias and no
compatibility mode**. The old names stop working in 3.0, and every one of them is listed here with its new name.

`weaver upgrade --target-version 3` bumps the `@appweaver/*` packages, their companion packages (Prisma, TypeBox,
TypeScript) and the skill files of the project, nothing else: it never rewrites the code or the config of a project.
The migration is yours to make, section by section, guided by this file and by the warnings the application logs at
startup.

## Contents

| Section                                                                     | CR           | Affects                          | Status  |
|-----------------------------------------------------------------------------|--------------|----------------------------------|---------|
| [1. Before you start](#1-before-you-start)                                  | -            | Everyone                         | pending |
| [2. TypeScript 7.1 and the project config](#2-typescript-71-and-the-project-config) | V3-TOOL-01 | Every project               | pending |
| [3. Lint, format and test tooling](#3-lint-format-and-test-tooling)         | V3-TOOL-05   | Every scaffolded project         | pending |
| [4. TypeBox 1.x](#4-typebox-1x)                                             | V3-TOOL-06   | Schemas, config sections, routes | pending |
| [5. Durations and sizes](#5-durations-and-sizes)                            | V3-CONV-01   | `appweaver.json`, `.env`         | pending |
| [6. Exposure: `actions` everywhere](#6-exposure-actions-everywhere)         | V3-CONV-02   | `createRoutes`, bulk env flags   | pending |
| [7. Maintenance jobs](#7-maintenance-jobs)                                  | V3-CONV-03   | Retention and pruning keys       | pending |
| [8. Secure defaults](#8-secure-defaults)                                    | V3-CONV-04   | JWT, redirects, CORS, body size  | pending |
| [9. `database.keepTables`](#9-databasekeeptables)                           | V3-CONV-05   | `KEEP_DATABASE_TABLE` keys       | pending |
| [10. Total count and offsets](#10-total-count-and-offsets)                  | V3-CONV-06   | `query` clients                  | pending |
| [11. Aggregates](#11-aggregates)                                            | V3-CONV-07   | `aggregate` clients              | pending |
| [12. Full names instead of abbreviations](#12-full-names-instead-of-abbreviations) | V3-CONV-08 | Config, routes, codes, types | pending |
| [13. Duplicate models, services, policies and routes](#13-duplicate-models-services-policies-and-routes) | V3-DATA-01 | Projects redefining a framework model | pending |
| [14. The system context of the application's own calls](#14-the-system-context-of-the-applications-own-calls) | V3-DATA-06 | Policies | pending |
| [15. Cache scopes](#15-cache-scopes)                                        | V3-WEB-01    | `cache` of the routes            | pending |
| [16. Forced 2FA](#16-forced-2fa)                                            | V3-WEB-02    | `forced` of the 2FA config       | pending |
| [17. Generated client](#17-generated-client)                                | V3-CLIENT-01, V3-CLIENT-03 | `weaver-client generate` output | pending |
| [18. OAuth2 sign-in and unverified emails](#18-oauth2-sign-in-and-unverified-emails) | V3-SEC-05 | OAuth2 providers           | done    |
| [19. Changes already released in 2.10.1](#19-changes-already-released-in-2101) | V3-SEC-01..04 | Filters, body size, CSV export | done |

Each section follows the same layout: **What changed**, **Who is affected**, **Before**, **After**, **Steps**.

---

## 1. Before you start

_pending_ (V3-DOC-05): upgrade to the latest 2.10.x first and fix every startup warning; run `weaver config check`
for every deployed environment; back up the database. Then apply the sections below in order, running `weaver config
check` and the tests after each one.

## 2. TypeScript 7.1 and the project config

_pending_ (V3-TOOL-01, D12): TypeScript 7.1 for the project; `baseUrl` removed from `tsconfig.json` (the `paths`
relative to the config), `types` and `typeRoots` listed explicitly, the decorator flags removed, `noImplicitAny: true`.

## 3. Lint, format and test tooling

_pending_ (V3-TOOL-05, D15): the 17 tooling packages of a scaffolded project replaced by the `@appweaver/tooling` dev
dependency, ESLint 10, `weaver lint`, `weaver format` and `weaver test`.

## 4. TypeBox 1.x

_pending_ (V3-TOOL-06, D17): `@sinclair/typebox` 0.34 replaced by `typebox` 1.x in the schemas of the config sections,
the models and the routes.

## 5. Durations and sizes

_pending_ (V3-CONV-01, D11): every duration key takes milliseconds or a unit string (`'200ms'`, `'15m'`, `'7d'`),
every size key bytes or a unit string (`'64KB'`, `'5MB'`). The keys in seconds today change their meaning, with no
compatibility mode:

| Key                                         | 2.x                   | 3.0                                   |
|---------------------------------------------|-----------------------|---------------------------------------|
| `security.jwt.expiresIn`                    | seconds (`604800`)    | `'7d'` or `604800000`                 |
| `security.jwt.refreshExpiresIn`             | seconds               | a duration                            |
| `cors.maxAge`                               | seconds               | a duration                            |
| `queue.keepCompletedSeconds`                | seconds               | `queue.keepCompleted`, a duration     |
| `queue.keepFailedSeconds`                   | seconds               | `queue.keepFailed`, a duration        |
| `security.oauth2.apple.clientSecretExpiresIn` | seconds             | a duration                            |

The TOTP `period` keeps its integer seconds (RFC 6238).

## 6. Exposure: `actions` everywhere

_pending_ (V3-CONV-02, D4): one `actions` list for REST, events and MCP; REST defaults to the CRUD actions, and
`aggregate`, `export` and the bulk routes are listed when wanted; the `RESOURCE_BULK_*_ENABLED` flags are removed.

## 7. Maintenance jobs

_pending_ (V3-CONV-03, D9): `audit.retentionInterval`, `audit.retentionWorker`, `timeseries.database.retentionInterval`,
`timeseries.database.retentionWorker` and `storage.versions.pruneInterval` replaced by `maintenance.jobs.<name>`.

## 8. Secure defaults

_pending_ (V3-CONV-04, D5):

| Key                               | 2.x                  | 3.0                                                          |
|-----------------------------------|----------------------|--------------------------------------------------------------|
| `security.jwt.expiresIn`          | 7 days               | 15 minutes                                                   |
| `security.jwt.refreshExpiresIn`   | 60 days              | 30 days, rotating, with reuse detection                      |
| `security.jwt.autoGenerateKeys`   | `true`               | `true` in `dev` and `test` only, a startup failure otherwise |
| `security.allowedRedirectHosts`   | `['*']`              | the host of `app.hostname`                                   |
| `cors.origin`                     | `['*']`              | `['*']` with a warning in production                         |
| `server.bodyMaxSize`              | `100M` (`10M` JSON since 2.10.1) | `1M` for JSON, uploads by their file fields' `maxSize` |

## 9. `database.keepTables`

_pending_ (V3-CONV-05): the five `*_KEEP_DATABASE_TABLE` keys replaced by one list, `database.keepTables`.

## 10. Total count and offsets

_pending_ (V3-CONV-06, D10): `query` answers no `totalCount` unless asked, a count beyond `resource.countLimit` is
bounded (`totalCountExact: false`), and offsets beyond `resource.maxOffset` are refused.

## 11. Aggregates

_pending_ (V3-CONV-07, D10): `aggregate` without `from` and `to` covers the whole range of its filter instead of the
last 7 days, and `interval` is required for periods.

## 12. Full names instead of abbreviations

_pending_ (V3-CONV-08, D23): `geo` → `spatial`, `2fa` → `twoFactor` (config, routes, JWT scope, error codes), `OTT` →
one-time token, `csvAddSepRow` → `csvAddSeparatorRow`, the CLI aliases `mge` and `mgn` removed. The full table is
`PLAN-v3.md` D23; it moves here with the change.

## 13. Duplicate models, services, policies and routes

_pending_ (V3-DATA-01, D2): a second definition under a taken name fails at startup; extend a framework or module
model with `extendModel`, `extendService`, `extendPolicy` and `extendRoutes`.

## 14. The system context of the application's own calls

_pending_ (V3-DATA-06, F39): a policy tells an anonymous request from the application's own calls (jobs, seeders,
tasks, tests).

## 15. Cache scopes

_pending_ (V3-WEB-01, D7): `cache: { scope: 'public' | 'user' | 'shared', ttl }` on the routes.

## 16. Forced 2FA

_pending_ (V3-WEB-02, D6): `forced: false | true | { roles }`, an enrolment scope instead of the silent `Email`
fallback, and a startup failure when a forced method has no service.

## 17. Generated client

_pending_ (V3-CLIENT-01, V3-CLIENT-03, D19): the types in their own file by default (`client.types.ts`), the per-model
aliases derived from generic types, doc comments opt-in (`--comments`).

## 18. OAuth2 sign-in and unverified emails

**What changed** (V3-SEC-05, F8): every provider reports whether it verified the email address
(`UserInfo.emailVerified`). A provider account is linked to an existing user without a password only when the provider
verified the address or the account is already linked to that user, otherwise the callback answers
`403 OAUTH2_EMAIL_UNVERIFIED`. A user registered by an OAuth2 sign-in, and the exchange of an existing user's sign-in,
mark the email verified only when the provider verified it.

**Who is affected**: applications with OAuth2 users without a password who sign in with a second provider that does not
verify addresses (Microsoft, an OpenID Connect issuer omitting `email_verified`), and applications defining their own
provider with `createOAuth2Plugin`.

**Before**: `extractUserInfo` returns `{ id, email, firstName, lastName }`; every OAuth2 registration has
`verifiedEmail: true`.

**After**: `extractUserInfo` returns `emailVerified: true` for an address the provider verified; Microsoft users are
registered with `verifiedEmail: false`.

**Steps**: return `emailVerified` from the `extractUserInfo` of your own providers; list `OAUTH2_EMAIL_UNVERIFIED` in
the error handling of the OAuth2 sign-in page of the client; let the Microsoft users verify their address through
`POST /auth/account/send-verify-email` where the application requires a verified one.

## 19. Changes already released in 2.10.1

Released in 2.10.1 (phase 1a); listed here for a project upgrading from an older 2.x:

- Filters are bounded (`resource.filter.maxConditions`, `maxDepth`, `maxListValues`), answering
  `400 RESOURCE_FILTER_TOO_COMPLEX` beyond them; a JSON body has its own limit, separate from the uploads (V3-SEC-01).
- The fields a relation's `output.omit` leaves out can no longer be filtered or sorted on (V3-SEC-02).
- A cached response replays only an allow list of headers (V3-SEC-03).
- The CSV export escapes the cells starting a formula with `'` (V3-SEC-04).
