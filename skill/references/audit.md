# Audit log

The audit log of `@appweaver/data` and `@appweaver/web` records who did what: every request of the server, by an
authenticated user or an anonymous one, and the changed fields of every record the resource services create, update
and delete. It is off by default:

```json
{
  "config": {
    "audit": {
      "enabled": true,
      "retention": "90d"
    }
  }
}
```

Enabling it adds the `AuditLog` and `AuditChange` models, so run `weaver generate` and `weaver migration new
add_audit_log` afterwards. `audit.keepDatabaseTable` keeps both tables while the audit log is disabled, like the
`keepDatabaseTable` of the API keys, so the next migration does not drop the history.

## Tables

`AuditLog` holds one entry per request, or per change made outside of a request:

| Field                                     | Description                                                                                   |
|-------------------------------------------|-----------------------------------------------------------------------------------------------|
| `id`                                      | A UUIDv7, so the entries sort by time.                                                        |
| `category`                                | `auth`, `read`, `write`, `change` (a change made outside of a request) or `custom`.          |
| `source`                                  | `http`, `mcp`, `realtime`, `job`, `task` or `system` (no scope, i.e. a queue worker).         |
| `action`                                  | The resource action (`update`), the auth route (`auth.login`), the tool (`mcp.post_create`). |
| `method`, `route`, `path`, `query`        | The request: its route template (`/api/posts/:id`) and its redacted query.                    |
| `body`                                    | The redacted JSON body, with `audit.requestBody` only.                                        |
| `status`, `errorCode`, `duration`         | The response status, the error code of a failed request, the duration in milliseconds.       |
| `userId`, `authType`, `apiKeyId`          | The user, empty for an anonymous request. A plain value without a relation, kept on deletion. |
| `ip`, `userAgent`, `requestId`, `traceId` | The client and the request, the trace of the telemetry.                                       |
| `model`, `resourceId`                     | The record of a resource route, or the one record a request changed (i.e. created).           |
| `metadata`                                | Free JSON of the entries of the application.                                                  |
| `createdAt`                               | When the request started.                                                                     |

`AuditChange` holds one row per changed record, deleted with its entry: `model`, `resourceId`, `action` (`create`,
`update`, `delete`) and `diff`, the changed fields as `{ field: { from, to } }`, `from` absent on a create and `to`
absent on a delete. A relation is compared by the ids of its records, a value longer than `audit.maxValueSize` is
truncated, and an update changing nothing is not recorded.

## Categories

Each category is switched and kept on its own, its empty `retention` falling back to `audit.retention`:

| Section         | Default | Records                                                                                                    |
|-----------------|---------|------------------------------------------------------------------------------------------------------------|
| `audit.auth`    | on      | The routes of `security.routePrefix` and `security.account.routePrefix` (login, OAuth2, 2FA, account), failed ones included. |
| `audit.read`    | off     | The `find`, `query`, `aggregate` and `export` routes, and the `GET` routes.                                |
| `audit.write`   | on      | The create, update, delete, bulk and file routes, and the routes of the other methods.                     |
| `audit.changes` | on      | The diffs of the records. Off, no `AuditChange` is written at all.                                         |
| `audit.custom`  | on      | The entries of `AuditService.record`.                                                                      |

The changes of a request whose category is disabled are still recorded, each with an entry of its own (`change`), so
`audit.write.enabled: false` keeps the history of the records without an entry per request.

## Excluding

- `audit.excludePaths`: URL paths, exact or a prefix ending with `*`. The health check, Swagger, static file and
  template preview routes are always left out, and so are the `OPTIONS` requests.
- `audit.excludeModels`: whole resources, their routes and their changes.
- `audit.excludeActions`: an action of every model (`find`, `export`, `auth.refresh`) or of one (`Post.update`).
- The `audit` option of a route: `false` leaves the route and the changes it makes out, an object sets the category
  and the action of its entries.

```ts
registerRoute((router) => router.post('/invoices/:id/send', sendInvoice), {
  audit: { category: 'custom', action: 'invoice.send' }
});

createRoutes({ modelName: 'Session', defaults: { audit: false } }); // every route of the resource
```

## Redaction

Passwords and secrets never reach the audit log. A value is replaced with `[Redacted]`, the change itself still
recorded, when its field:

- is `hidden` (`passwordHash`, `keyHash`) or has the `redact` option,
- is named like a secret: `password`, `secret`, `token`, `privateKey`, `credentials`, `apiKey` and their compounds
  (`clientSecret`, `refreshToken`),
- or is one of `audit.redactKeys` (`['code']` by default, the 2FA and OAuth2 codes).

The same names are redacted inside the JSON fields, the query and the body. `redact` keeps a field in the API output
while keeping its values out of the audit log:

```ts
createModel({
  name: 'Patient',
  scalars: {
    diagnosis: { type: 'string', redact: true }
  }
});
```

The `email` and `phone` of the auth model take `redact` too, to keep the contact details of the users out of the diffs
(`createAuthModel({ name: 'User', scalars: { email: { type: 'string', redact: true } } })`).

`audit.anonymizeIp` stores the client addresses without their last octet (IPv4) or their last 80 bits (IPv6).

## Writing

The entries are buffered and written in batches (`audit.flushInterval`, `audit.batchSize`), so a request never waits
for its entry, and flushed when the application stops. A batch failing is retried once with the next flush. Beyond
`audit.maxBuffer` buffered entries the new ones are dropped with a warning.

A change is recorded once its transaction commits, so a rolled back change leaves no trace. Only the writes of the
resource services are recorded: code writing through Prisma directly (`service.client`, `db.client()`) records its
changes itself:

```ts
import { inject } from '@appweaver/core';
import { AuditService } from '@appweaver/data';

const audit = inject(AuditService);

const previous = await tx.order.findUnique({ where: { id } });
const current = await tx.order.update({ where: { id }, data: { status: 'shipped' } });
audit.recordChange('Order', 'update', previous, current);

audit.record({ category: 'custom', action: 'invoice.sent', model: 'Invoice', resourceId: invoice.id });
```

`record` takes the user, the client and the trace of the current call when the entry does not set them.

## Request scope

A change belongs to the entry of the request it is made in through the request scope of `@appweaver/core`, which the
web module creates for every request. Outside of a request, run the code in a scope to record its changes under a
source and an action:

```ts
import { runInRequestScope, setRequestScope } from '@appweaver/core';

await runInRequestScope({ source: 'job', action: 'import.products' }, () => importProducts());

setRequestScope({ action: 'report.publish' }); // the action of the entry of the current request
```

`weaver run` runs every task in a scope of the `task` source (`task.<name>`), and the MCP server names the tool of a
call (`source: 'mcp'`, `mcp.<tool>`). The actions of the realtime connections are not recorded yet, only the request
opening the connection.

## Reading

The framework manages the two models only. The application decides who reads the audit log and how, exposing the
models like its own resources, with a service, its routes and a policy each (`src/resources/audit-log/`,
`src/resources/audit-change/`):

```ts
// service.ts
export default createService({ modelName: 'AuditLog' });

// routes.ts: read-only, for the admins, reading the audit log left out of it
export default createRoutes({
  modelName: 'AuditLog',
  defaults: { roles: ['Admin'], audit: false },
  create: { exclude: true },
  update: { exclude: true },
  delete: { exclude: true },
  export: { exclude: true }
});

// policy.ts: append-only, so no service call changes the history either
export default createPolicy({
  modelName: 'AuditLog',
  checkAccess: (_user, _resource, action) => !['create', 'update', 'delete'].includes(action)
});
```

The same for `AuditChange`. The routes take the filters, sorts and paging of every resource route, and permissions or
`readRestrictions` of the policy (i.e. the entries of a tenant) like any resource. An entry found by its id comes with
its changes, and a change with its entry, so the history of a record is a query of the changes:

```http
POST /api/audit-changes/query
{ "filter": { "model": "Post", "resourceId": "5" }, "sort": "-createdAt" }
```

Only the `AuditService` writes the tables and only the retention deletes the entries, so keep the write routes
excluded. `sample/cms-api` exposes both models this way.

## Retention

Every `audit.retentionInterval` the entries older than the retention of their category are deleted with their changes,
in batches. `audit.retentionWorker: false` leaves the deletes to another instance, or to a task calling
`AuditService.purge()`.
