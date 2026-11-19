# MCP server

`@appweaver/mcp` exposes the application to AI agents (Claude, Cursor, ...) over the Model Context Protocol: the
resource actions a model opts into and the custom tools of `createMcpTool`. Nothing is exposed unless declared, every
tool runs as the authenticated user so the resource policies apply, and destructive tools need two opt-ins.

```sh
npm install @appweaver/mcp   # or: weaver module add mcp
```

## Endpoint and authentication

`POST /mcp` (`mcp.routePrefix`, i.e. `/api/mcp` to put it under the API) is the Streamable HTTP transport without sessions: a JSON-RPC message (`initialize`,
`ping`, `tools/list`, `tools/call`) answered with its JSON response, `202` for a notification, `405` for `GET` and
`DELETE`. A request authenticates with the strategies of `mcp.auth` (JWT and API keys by default); without
credentials it is refused with `401` unless `mcp.anonymousEnabled`, which shows only the `public` tools. A browser
`Origin` not in `mcp.allowedOrigins` is refused with `MCP_ORIGIN_DENIED`.

```sh
claude mcp add --transport http my-api http://localhost:3000/mcp --header "X-Api-Key: <key>"
```

`tools/list` returns only the tools the user may call.

## Resource tools

Opt a model in with the `mcp` key of `createRoutes`, like `events`:

```ts
export default createRoutes({
  modelName: 'post',
  defaults: { roles: ['editor'] },           // the API routes, and the tools by default
  delete: { roles: ['admin'] },
  mcp: {
    description: 'The articles of the blog.',
    actions: ['find', 'query', 'aggregate', 'create', 'delete'],
    exclude: ['internalNote'],               // fields left out of the results, filters and sorts
    maxLimit: 20                             // default: mcp.maxLimit
  }
});
```

A tool has the access of its API route (`public`, `roles`, `permissions`, from the route or the `defaults`), so the
agents of a user can do what the user can do through the API. The `mcp` config overrides it for every action
(`mcp: { public: true, ... }`) or for one (`{ action: 'delete', roles: ['admin'] }`), the action first. The API route
may be excluded, the tool still runs. The resource events of `@appweaver/realtime` default the same way to the access
of the `find` route.

| Tool             | Arguments                                                     | Kind        |
|------------------|---------------------------------------------------------------|-------------|
| `post_find`      | `{ id }`                                                      | read-only   |
| `post_query`     | `{ filter?, sort?, page?, size?, cursor? }`                   | read-only   |
| `post_aggregate` | `{ select, filter?, dateField?, from?, to?, step? }`          | read-only   |
| `post_create`    | the create body of the model                                  | write       |
| `post_update`    | `{ id, data }`                                                | destructive |
| `post_delete`    | `{ id }`                                                      | destructive |

- The tool names are the snake case of the model and the action (`blog_post_query`).
- The query filter covers the visible scalar fields: a value, or the operators `_eq`, `_ne`, `_gt`, `_gte`, `_lt`,
  `_lte`, `_in`, `_exists` (and `_contains`, `_starts`, `_ends`, `_ilike` on texts), combined with `_or`. The sort is
  `{ field: 'asc' | 'desc' }`.
- The results are projected onto the response schema of the model, its relations included (no hidden fields, i.e. no
  password hash of an author), and the `exclude` fields are left out of the results, the filter, the sort and the
  aggregations.
- The string formats of the arguments are checked (`date-time`, `email`, `uuid`, ...), a date with its time zone, i.e.
  `2026-11-19T14:37:00Z` or `2026-11-19T15:37:00+01:00`.
- The schemas are published as plain JSON Schema, the model references inlined.

## Custom tools

```ts
export const refundOrder = createMcpTool({
  name: 'refundOrder',
  description: 'Refunds a paid order',
  input: Type.Object({ orderId: Type.Integer(), reason: Type.String() }),
  output: Type.Object({ refundId: Type.String() }),   // optional
  roles: ['support'],                                 // or public / permissions
  destructive: true,                                  // or readOnly: true
  handler: ({ orderId, reason }, { user, signal }) => refunds.refund(orderId, reason)
});

createMcpTool({ ...getOrder, roles: ['support'] }); // an AI tool of createAiTool (parameters, execute)
```

The arguments are validated against `input` (defaults filled in) before the handler runs. A text result is returned
as text, any other value as JSON text and `structuredContent` (an array or a scalar as `{ result }`).

## Destructive tools

`update`, `delete` and every tool marked `destructive` need both:

1. listing the action (or `destructive: true` on the tool), and
2. `mcp.destructiveEnabled: true` (default `false`).

Until then they are hidden, with a warning logged once. Every tool also carries the `readOnlyHint` and
`destructiveHint` annotations, so clients can ask the user before running it.

## Errors and limits

A failed call returns `isError: true` with `{ code, message, details }` of an Appweaver error (`MCP_INPUT_INVALID`
for invalid arguments, `RESOURCE_NOT_FOUND`, ...); any other error is logged and returned as `INTERNAL_ERROR`. A
result over `mcp.maxResultSize` fails with `MCP_RESULT_TOO_LARGE`. An unknown tool, or one the user may not call, is
the JSON-RPC error `-32602`.

## Logging, telemetry, testing

Every call is logged at the info level (`mcp.logCalls`): the tool, the user, the duration and the outcome. Every call
is a `tools/call <tool>` server span (`mcp.method.name`, `gen_ai.tool.name`) with the `mcp.server.operation.duration`
metric (`telemetry.instrumentations.mcp`).

```ts
const mcp = createMcpClient((request) => app.server.inject(request), { headers: { 'x-api-key': key } });
const tools = await mcp.listTools();
const { structuredContent, isError } = await mcp.callTool('post_find', { id: 1 });
```

`createMcpClient` of `@appweaver/testing` sends the JSON-RPC requests through `inject`, as the user of the headers.
