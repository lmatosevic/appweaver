# Database

The database module exposes a thin abstraction over the underlying database client. The default implementation
wraps [Prisma](https://www.prisma.io/) and is registered under the abstract `Database` class. The framework connects on
startup and disconnects on shutdown automatically. An unreachable database never fails the startup: the connection is
checked with a `SELECT 1`, the failure is logged as an error, and the next query connects again with a new client.

## Injecting the client

A project scaffolded with the `data` module exports the typed client from `database/client.ts`, imported as
`@db/client`:

```ts
import { injectDatabaseClient } from '@appweaver/core';
import { PrismaClient } from '@db/client/client';

export const db = injectDatabaseClient<PrismaClient>();

export default db;
```

#### `injectDatabaseClient<T>()`

Returns the client of the `Database` definition, typed by `T` (the generated `PrismaClient`). The client is resolved
from the application context on every member access rather than when `injectDatabaseClient` is called, so it can be
created at the top level of a module that is imported before the application is created, i.e. by a test file, and it
always reaches the database of the current application. Accessing a member before the application is created throws,
as `inject(Database)` does.

```ts
import db from '@db/client';

const users = await db.user.findMany({ where: { enabled: true } });
```

#### `db.client<T>()`

Returns the underlying database client cast to type `T`. For the default Prisma provider `T` is `PrismaClient`. The
client runs its queries in the current transaction, so a client resolved once at startup still joins one.

```ts
const users = await client.user.findMany({ where: { active: true } });
```

#### `db.connect()`

Opens the database connection, throwing when it fails. Called by the framework during `onInit`, which logs the failure
instead of throwing.

#### `db.disconnect()`

Closes the database connection. Called automatically by the framework during `onDestroy`.

#### `db.checkHealth()`

Returns a `HealthCheckResult`. Executes a lightweight `SELECT 1` query to verify the connection.

## Transactions

`runTransaction` runs a function in one transaction. Every resource service call and client query made inside it
commits together when it resolves, and an error thrown out of it rolls everything back and is rethrown unchanged. An
error caught inside the function does not roll back.

```ts
import { afterCommit, injectService } from '@appweaver/core';
import { runTransaction } from '@appweaver/data';
import { Prisma } from '@db/client/client';

const orders = injectService('Order');

// The parameter type gives the transaction client the models of the application
const order = await runTransaction(async (tx: Prisma.TransactionClient) => {
  const order = await orders.create({ customer: customerId, total });
  await tx.product.updateMany({ where: { id: productId, stock: { gte: 1 } }, data: { stock: { decrement: 1 } } });
  afterCommit(() => sendOrderEmail(order)); // runs only once committed
  return order;
});

await runTransaction('Serializable', async () => {
  // Database calls...
});
await runTransaction({ isolationLevel: 'Serializable', timeout: 10_000, maxWait: 2_000, retries: 3 }, async () => {
  // Database calls...
});
```

| Option           | Default                                           | Description                                                                       |
|------------------|---------------------------------------------------|-----------------------------------------------------------------------------------|
| `isolationLevel` | database default, always `Serializable` on SQLite | `ReadUncommitted`, `ReadCommitted`, `RepeatableRead`, `Serializable`, `Snapshot`. |
| `timeout`        | `DATABASE_TRANSACTION_TIMEOUT`                    | Maximum run time in milliseconds.                                                 |
| `maxWait`        | `DATABASE_TRANSACTION_MAX_WAIT`                   | Maximum wait for a connection in milliseconds.                                    |
| `retries`        | `0`                                               | Reruns the whole function after a write conflict (Prisma `P2034`).                |

- The resource events, the cache invalidation, and the removal of stored files run after the commit and are dropped on
  rollback. A file stored inside a rolled back transaction is removed. Wrap other side effects (emails, jobs) in
  `afterCommit(fn)`, which runs right away outside a transaction.
- A `runTransaction` (or `$transaction`) inside another one joins it. Asking it for another isolation level throws.
- On PostgreSQL a failed query aborts the whole transaction, so only catch the errors thrown before a write fails (i.e.
  a `RESOURCE_NOT_FOUND` or `RESOURCE_FORBIDDEN` of a service).
- A failed database operation of a resource service throws a `DatabaseError` describing it, i.e.
  `DATABASE_UNIQUE_VIOLATION` with the violated `fields` in its details. Translate the errors of a direct Prisma call
  the same way with `toDatabaseError(e, 'Model')` (see `errors.md`).

---

## Schema and migrations

By convention the Prisma schema lives at `./database/schema.prisma` and migrations at `./database/migrations/`. These
paths are configurable.

**schema.prisma example:**

```prisma
datasource db {
  provider = env("DATABASE_TYPE")
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  name  String 
}
```

Generate the Prisma schema and client after resource models change:

```bash
weaver generate
```

Check whether the models need a new migration, then create it:

```bash
weaver migration check                  # exit code 1 and the SQL when one is needed
weaver migration new <migration_name>
```

Run pending migrations, or print them with their SQL first:

```bash
weaver migrate --dry-run
weaver migrate
```

---

## Configuration

| Key                             | Type     | Default                      | Description                                     |
|---------------------------------|----------|------------------------------|-------------------------------------------------|
| `DATABASE_TYPE`                 | `enum`   | —                            | `sqlite`, `postgresql`, `mysql`, or `sqlserver` |
| `DATABASE_URL`                  | `string` | —                            | Connection string / DSN of the application      |
| `DATABASE_MIGRATION_URL`        | `string` | `DATABASE_URL`               | Connection string / DSN of the migrations       |
| `DATABASE_SCHEMA_PATH`          | `string` | `'./database/schema.prisma'` | Path to the Prisma schema file                  |
| `DATABASE_MIGRATIONS_DIR_PATH`  | `string` | `'./database/migrations'`    | Path to the migrations directory                |
| `DATABASE_TRANSACTION_MAX_WAIT` | `int`    | `2000`                       | Max time (ms) to wait to acquire a transaction  |
| `DATABASE_TRANSACTION_TIMEOUT`  | `int`    | `5000`                       | Max time (ms) a transaction may run             |
| `DATABASE_PROVIDER`             | `string` | `'auto'`                     | `auto`/`prisma`, or `none` for no database      |

Configure the URL in `appweaver.json`, referencing the password of the gitignored `.env` (`DB_PASSWORD=myapp`), a
`DB_HOST` a docker-compose container sets to the database service name, and a `DB_NAME` and `DB_USER` to rename the
database or change its user. The type is resolved from the URL scheme when not set:

```json
{
  "config": {
    "database": {
      "url": "postgresql://${DB_USER:-myapp}:${DB_PASSWORD}@${DB_HOST:-localhost}:5432/${DB_NAME:-myapp}"
    }
  }
}
```

The test database URL goes to the `environments.test` section of `appweaver.json` (i.e. the `${DB_NAME:-myapp}-test`
database of the same server).

PostgreSQL uses the `public` schema unless the URL selects another one with `?schema=` (i.e.
`...:5432/myapp?schema=webshop`). Prisma Migrate creates the schema and its tables there, and the framework passes it on
to the PostgreSQL adapter, so the queries use it as well. Existing tables are not moved from `public`. Prefer a name
without hyphens (`my_app`), which raw SQL would otherwise have to double-quote.

### Separate migration and application users

`database.url` is the connection the application queries the data with, and `database.migrationUrl` the one of the
migrations: every Prisma command of the CLI (`weaver migrate`, `weaver migration new|check|reset`, `weaver test
setup|reset`) reads it through the `url` of `prisma.config.ts`, which is `migrationUrl()` of `@appweaver/data/config`,
`database.url` when the migration URL is not set. It lets the application connect as a user that can only read and
write the rows, while the migrations run as the owner of the tables, or through a direct connection while the
application goes through a pooler (PgBouncer, Neon, Supabase). `migrationUrl()` fails when the two URLs point to other
types or names of databases, i.e. an environment overriding one of them but not the other, so set both in the
`environments` that change the database.

```json
{
  "config": {
    "database": {
      "url": "postgresql://${DB_APP_USER:-myapp-app}:${DB_APP_PASSWORD}@${DB_HOST:-localhost}:5432/${DB_NAME:-myapp}",
      "migrationUrl": "postgresql://${DB_USER:-myapp}:${DB_PASSWORD}@${DB_HOST:-localhost}:5432/${DB_NAME:-myapp}"
    }
  }
}
```

On PostgreSQL, the hypertables of the `timescale` time series and the geometry triggers of the `postgis` geo fields
need the owner of the tables, so `weaver migrate` sets them up after the migrations, and an application start finding
them out of date fails, asking to run `weaver migrate`. Build before migrating, since the setup reads the models of the
build. The owner keeps the right to create databases in development, where `weaver migration new` creates the shadow
database of Prisma.

The privileges of the application user, granted once by the owner for the tables it creates later:

```sql
-- PostgreSQL
CREATE ROLE "myapp-app" LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE "myapp" TO "myapp-app";
GRANT USAGE ON SCHEMA public TO "myapp-app";
ALTER DEFAULT PRIVILEGES FOR ROLE "myapp" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "myapp-app";
ALTER DEFAULT PRIVILEGES FOR ROLE "myapp" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "myapp-app";

-- MySQL / MariaDB
CREATE USER 'myapp-app'@'%' IDENTIFIED BY '...';
GRANT SELECT, INSERT, UPDATE, DELETE ON `myapp`.* TO 'myapp-app'@'%';

-- SQL Server
CREATE LOGIN [myapp-app] WITH PASSWORD = '...';
CREATE USER [myapp-app] FOR LOGIN [myapp-app];
ALTER ROLE db_datareader ADD MEMBER [myapp-app];
ALTER ROLE db_datawriter ADD MEMBER [myapp-app];
```

The `sample/vehicle-tracking-api` sample runs this way, its `database/postgres-init.sh` creating the application user.
SQLite has no users, so it needs neither URL.

---

## Real-world example

```ts
import { inject } from '@appweaver/core';
import db from '@db/client';

export class UserRepository {
  async findById(id: number) {
    return db.user.findUnique({ where: { id } });
  }

  async create(data: { email: string; name: string }) {
    return db.user.create({ data });
  }

  async runInTransaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return db.$transaction(fn);
  }
}
```
