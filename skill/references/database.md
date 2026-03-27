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

Returns the underlying database client cast to type `T`. For the default Prisma provider `T` is `PrismaClient`.

```ts
const users = await client.user.findMany({ where: { active: true } });
```

#### `db.connect()`

Opens the database connection. Called automatically by the framework during `onInit`.

#### `db.disconnect()`

Closes the database connection. Called automatically by the framework during `onDestroy`.

#### `db.checkHealth()`

Returns a `HealthCheckResult`. Executes a lightweight `SELECT 1` query to verify the connection.

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
