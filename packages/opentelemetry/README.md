<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The OpenTelemetry SDK of Appweaver, the AI-first <a href="https://nodejs.org" target="_blank">Node.js</a> framework for backends built with agents.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/opentelemetry" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/opentelemetry.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/opentelemetry.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/opentelemetry" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/opentelemetry.svg" alt="NPM Downloads" /></a>
</p>

## Description

`@appweaver/opentelemetry` exports the [OpenTelemetry](https://opentelemetry.io) traces, metrics and logs of an
[Appweaver](https://github.com/lmatosevic/appweaver) application, a module enabled by installing it. The framework
records the spans and the metrics of the HTTP requests, the database operations, the queue jobs, the scheduled jobs,
the mailer, the SMS sender, the cache and the tasks through the OpenTelemetry API, and this module starts the SDK that
exports them over OTLP (HTTP) to any backend: a collector, Honeycomb, Datadog, Sentry, Grafana, New Relic and others.

## Installation

```sh
npm install @appweaver/opentelemetry
```

or `weaver module add telemetry` in a project created with `@appweaver/create`.

## Configuration

```jsonc
// appweaver.json
"telemetry": {
  "endpoint": "https://api.honeycomb.io",
  "headers": ["x-honeycomb-team=${HONEYCOMB_API_KEY}"],
  "logs": { "enabled": true }
}
```

The standard `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_SERVICE_NAME` and
`OTEL_RESOURCE_ATTRIBUTES` environment variables are read where the config sets nothing. A backend the config does not
cover is added with `configureTelemetry`:

```ts
import { configureTelemetry } from '@appweaver/opentelemetry';

configureTelemetry((options) => {
  options.spanProcessors.push(new BatchSpanProcessor({ exporter: new MyVendorExporter() }));
});
```

## Documentation

- [Telemetry reference](https://github.com/lmatosevic/appweaver/blob/main/skill/references/telemetry.md) – what is recorded, the config, the backends and the tests
- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
