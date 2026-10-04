# Database

The database module exposes a thin abstraction over the underlying database client. The default implementation
wraps [Prisma](https://www.prisma.io/) and is registered under the abstract `Database` class. The framework connects on
startup and disconnects on shutdown automatically.

## Injecting the client

```ts
import { inject } from '@appweaver/core';
import { Database } from '@appweaver/common';
import { PrismaClient } from '@db/client/client';

export const db = inject(Database).client<PrismaClient>();

export default db;
```

#### `db.client<T>()`

Returns the underlying database client cast to type `T`. For the default Prisma provider `T` is `PrismaClient`. The
client runs its queries in the current transaction, so a client resolved once at startup still joins one.

```ts
const users = await client.user.findMany({ where: { active: true } });
```

#### `db.connect()`

Opens the database connection. Called automatically by the framework during `onInit`.

#### `db.disconnect()`

Closes the database connection. Called automatically by the framework during `onDestroy`.

#### `db.checkHealth()`

Returns a `HealthCheckResult`. Executes a lightweight `SELECT 1` query to verify the connection.

## Transactions

`runTransaction` runs a function in one transaction. Every resource service call and client query made inside it
commits together when it resolves, and an error thrown out of it rolls everything back and is rethrown unchanged. An
error caught inside the function does not roll back.

```ts
import { afterCommit, injectService, runTransaction } from '@appweaver/core';
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
  a
  404 or 403 of a service).

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

Create new migrations:

```bash
weaver migration new <migration_name>
```

Run pending migrations:

```bash
weaver migrate
```

---

## Configuration

| Key                             | Type     | Default                                      | Description                                     |
|---------------------------------|----------|----------------------------------------------|-------------------------------------------------|
| `DATABASE_TYPE`                 | `enum`   | —                                            | `sqlite`, `postgresql`, `mysql`, or `sqlserver` |
| `DATABASE_URL`                  | `string` | —                                            | Connection string / DSN                         |
| `DATABASE_SCHEMA_PATH`          | `string` | `'./database/schema.prisma'`                 | Path to the Prisma schema file                  |
| `DATABASE_MIGRATIONS_DIR_PATH`  | `string` | `'./database/migrations'`                    | Path to the migrations directory                |
| `DATABASE_TRANSACTION_MAX_WAIT` | `int`    | `2000`                                       | Max time (ms) to wait to acquire a transaction  |
| `DATABASE_TRANSACTION_TIMEOUT`  | `int`    | `5000`                                       | Max time (ms) a transaction may run             |
| `DATABASE_PROVIDER`             | `string` | `'@appweaver/core/database/prisma-database'` | Path to the Database implementation             |

**`appweaver.json` example:**

```json
{
  "DATABASE_TYPE": "postgresql",
  "DATABASE_URL": "postgresql://user:pass@localhost:5432/myapp?schema=public"
}
```

**`.env` example:**

```
DATABASE_TYPE=postgresql
DATABASE_URL=postgresql://user:pass@localhost:5432/myapp?schema=public
```

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
