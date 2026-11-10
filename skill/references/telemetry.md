# Telemetry (OpenTelemetry)

Appweaver is instrumented with [OpenTelemetry](https://opentelemetry.io): the framework records traces and metrics
through the OpenTelemetry API, and the `@appweaver/opentelemetry` module starts the SDK exporting them, with the logs,
over OTLP. The config keys are listed in [configuration.md](./configuration.md#telemetry-telemetry_).

Two parts, on purpose:

- **Instrumentation** — in `@appweaver/common`, `core`, `data`, `web` and the drivers, through `@opentelemetry/api`
  only. It records nothing, at no cost, until an SDK is registered, and reaches *any* registered SDK.
- **SDK** — `@appweaver/opentelemetry`, enabled by installing it (`weaver module add telemetry`, or
  `npm install @appweaver/opentelemetry`). It reads the `telemetry` config, exports over OTLP (HTTP), and is flushed
  and stopped with the application.

There is no telemetry contract and no provider per vendor: OTLP is the standard every backend ingests, see
[Backends](#backends).

## What is recorded

| Part (`telemetry.instrumentations.<key>`) | Spans                                                                                                                   | Metrics                                                    |
|-------------------------------------------|-------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------|
| `http` (`@appweaver/web`)                 | A server span per request, `GET /api/posts/:id`, continuing the `traceparent` header, with the status and the `user.id` | `http.server.request.duration`, `http.server.active_requests` |
| `database` (`@appweaver/data`)            | A client span per Prisma operation, `findMany Post` or `$queryRaw`, without the query and its arguments                 | `db.client.operation.duration`                             |
| `queue` (`memory`, `bullmq`)              | A producer span `send <queue>` and a consumer span `process <queue>` per attempt, in the trace of the sender            | `messaging.client.sent.messages`, `messaging.process.duration` |
| `scheduler` (`@appweaver/cron`)           | The root span of a new trace per run, `scheduler <name>`                                                                | `appweaver.scheduler.job.duration`                         |
| `mailer`, `sms`                           | A client span per sent email (`mailer send`) and text message (`sms send`), inside the span of their queue job          | —                                                          |
| `cache`                                   | —                                                                                                                       | `appweaver.cache.requests` (`appweaver.cache.result`: `hit`, `miss`) |
| `task` (`weaver run`)                     | The root span of the task, `task <name>`, exported when the task ends                                                   | —                                                          |
| `fetch` (`@appweaver/opentelemetry`)      | A client span per outbound `fetch` request, which also sends the `traceparent` header. Node.js only                     | `http.client.request.duration`                             |

The names and the attributes follow the OpenTelemetry semantic conventions (`http.*`, `db.*`, `messaging.*`), the ones
of the framework are prefixed with `appweaver.`.

- **HTTP**: only a `5xx` response fails the span (`error.type`, the exception). A `4xx` keeps it unset and adds the
  error code as `appweaver.error.code`. The health check routes are left out (`telemetry.http.healthCheck`), and so
  are the paths of `telemetry.http.ignorePaths` (`['/public/*', '/favicon.ico']`). An unknown route is named after its
  method alone.
- **Queue**: the trace context travels with the job, so the request that sent a job, the job and everything the worker
  does are one trace, whichever process runs the worker. BullMQ stores it in the `telemetry.metadata` option of the
  job, which `bullmq-otel` of another service reads too.
- **Scheduler**: name a job to name its spans and its metric series, `addJob({ name: 'reports:daily', ... })`.
- **Problem details**: an error response of a traced request carries the `traceId` next to the `requestId`, to find
  its trace from a bug report.

## Configuration

```jsonc
// appweaver.json
"telemetry": {
  "endpoint": "http://${OTEL_HOST:-localhost}:4318",
  "headers": ["x-api-key=${OTEL_API_KEY}"],
  "traces": { "sampleRatio": 0.2 },
  "logs": { "enabled": true, "level": "warn" },
  "http": { "ignorePaths": ["/public/*"] },
  "instrumentations": { "cache": false }
}
```

- `telemetry.enabled: false` turns everything off: the instrumentation, the log correlation and the SDK. A project
  scaffolded with the `telemetry` module sets it in the `test` environment.
- `telemetry.exporter`: `otlp` (default), `console` (prints the telemetry, for development) or `none` (the default of
  the `test` environment, exporting only through the processors of `configureTelemetry`).
- The traces and the metrics are exported by default, the logs with `telemetry.logs.enabled`.
- The standard `OTEL_*` environment variables are read where the config sets nothing: `OTEL_EXPORTER_OTLP_ENDPOINT`,
  `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`. The `telemetry` keys win.
- The service is described by `service.name` (`telemetry.serviceName`, else `app.name`), `service.version`
  (`app.version`) and `deployment.environment.name` (`app.env`), plus `telemetry.resourceAttributes`
  (`['service.namespace=shop']`).

## Logs

The `log` config is untouched, telemetry adds two things to the logs:

- **Correlation** (`telemetry.logCorrelation`, on by default): every record written inside a span carries its
  `trace_id`, `span_id` and `trace_flags`, on the console and in the log file, with or without the SDK module.
- **Export** (`telemetry.logs.enabled`, off by default): the records of every logger are also sent over OTLP, from
  `telemetry.logs.level` up, with the logger name as `appweaver.logger`, the error as `exception.*` and the trace of
  their span. The level never lowers what a logger writes (`log.level`, `log.levels`).

## Custom spans and metrics

`@appweaver/common` exports the helpers the framework itself uses, so application code needs no OpenTelemetry import:

```ts
import { currentSpan, telemetryCounter, withSpan } from '@appweaver/common';

const invoices = telemetryCounter('billing.invoices', { description: 'Invoices issued.' });

export async function issueInvoice(orderId: number) {
  // The span of the request or the job this runs in
  currentSpan()?.setAttribute('order.id', orderId);

  // Ends when the promise settles, an error is recorded on it and thrown again
  return withSpan('invoice render', { attributes: { 'order.id': orderId } }, async (span) => {
    const pdf = await render(orderId);
    span.setAttribute('invoice.size', pdf.length);
    invoices().add(1, { currency: 'EUR' });
    return pdf;
  });
}
```

| Helper                                                                | Purpose                                                                                       |
|-----------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| `withSpan(name, options, fn)`                                         | Runs `fn` in a span, the parent of what it calls. `options`: `kind`, `attributes`, `root`, `parent` |
| `startSpan(name, options)` / `runInTraceContext(context, fn)`         | A span ended by the caller, and running code as its child                                     |
| `currentSpan()` / `currentTraceId()`                                  | The active span and the id of its trace                                                       |
| `telemetryCounter` / `telemetryUpDownCounter` / `telemetryHistogram`  | Declare a metric once at module level, call the result to record: `counter().add(1)`          |
| `injectTraceContext()` / `extractTraceContext(carrier)`               | Carry a trace through a transport of your own (a message, a file, a webhook)                  |
| `traceQueueSend` / `traceQueueProcess`                                | The producer and consumer spans of a custom `Queue` driver                                    |
| `telemetryEnabled(part?)`                                             | Whether telemetry, or one part of it, is on                                                   |
| `telemetryTracer()` / `telemetryMeter()`                              | The tracer and the meter, for anything else                                                   |

Keep span names free of ids and other high-cardinality values, put them into attributes. For the full API install
`@opentelemetry/api` (the version of `@appweaver/common`), it shares the same global SDK.

## Backends

| Route              | How                                                                                           | Use for                                                                    |
|--------------------|-----------------------------------------------------------------------------------------------|----------------------------------------------------------------------------|
| OTLP config        | `telemetry.endpoint` and `telemetry.headers`, or the `OTEL_EXPORTER_OTLP_*` variables         | Honeycomb, Datadog, Sentry, Grafana, New Relic, an OpenTelemetry Collector |
| `configureTelemetry` | Add or replace exporters, processors, the sampler, the id generator, instrumentations       | A vendor exporter, AWS X-Ray ids and propagator, Prisma engine spans       |
| Own SDK            | Do not install `@appweaver/opentelemetry`, start the SDK of the vendor before the application | `dd-trace`, the Sentry SDK, the Azure Monitor distro, ADOT                 |

```jsonc
// Honeycomb
"telemetry": { "endpoint": "https://api.honeycomb.io", "headers": ["x-honeycomb-team=${HONEYCOMB_API_KEY}"] }
// A collector or an agent on the host (Datadog Agent, Grafana Alloy, ADOT for X-Ray, ...)
"telemetry": { "endpoint": "http://localhost:4318" }
```

A backend that takes no OTLP directly (AWS X-Ray, Azure Application Insights) is reached through a collector, or its
exporter with `configureTelemetry`. Call it before the application starts, in an application file or the `main` part
of a module:

```ts
// src/features/telemetry/index.ts
import { configureTelemetry } from '@appweaver/opentelemetry';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace';
import { PrismaInstrumentation } from '@prisma/instrumentation';

configureTelemetry((options) => {
  // The parts created from the config, changed in place
  options.spanProcessors.push(new BatchSpanProcessor({ exporter: new MyVendorExporter() }));
  options.instrumentations.push(new PrismaInstrumentation());
  options.resourceAttributes['service.namespace'] = 'shop';
});
```

`options` holds `resourceAttributes`, `spanProcessors`, `sampler`, `propagator`, `metricReaders`, `views`,
`logRecordProcessors`, `instrumentations`, `idGenerator` and `contextManager`. With `telemetry.exporter: 'none'` only
what the function adds is exported.

When another OpenTelemetry SDK is already registered, `@appweaver/opentelemetry` leaves it in place with a warning,
and the framework spans go to it. The instrumentations patching a library when it is imported (`pg`, `ioredis`) are not
included: the Prisma operations and the queue jobs are traced by the framework, and such an instrumentation must be
loaded with `node --import` before the application.

To look at traces locally without a vendor, run Jaeger and keep the default endpoint:

```sh
docker run --rm -p 16686:16686 -p 4318:4318 jaegertracing/jaeger
```

## Testing

`recordTelemetry` of `@appweaver/testing` registers an in-memory SDK, so a test reads the spans and the metrics of the
framework and of the application:

```ts
import { recordTelemetry, TelemetryRecorder } from '@appweaver/testing';

let telemetry: TelemetryRecorder;
beforeEach(() => (telemetry = recordTelemetry()));
afterEach(() => telemetry.stop());

test('traces the invoice', async () => {
  await issueInvoice(7);

  expect(telemetry.span('invoice render').attributes).toMatchObject({ 'order.id': 7 });
  expect((await telemetry.metric('billing.invoices'))?.dataPoints[0].value).toBe(1);
});
```

`TelemetryService` of `@appweaver/opentelemetry` (`inject(TelemetryService)`) exposes the started `sdk` and
`forceFlush()`, for a process exiting without stopping the application.
