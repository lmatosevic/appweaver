<p align="center">
  <a href="https://appweaver.co" target="_blank"><img src="https://raw.githubusercontent.com/lmatosevic/appweaver/refs/heads/main/resources/appweaver-logo.svg" width="460" alt="Appweaver Logo" /></a>
</p>

<p align="center">
  The InfluxDB 3 driver of Appweaver, the AI-first <a href="https://nodejs.org" target="_blank">Node.js</a> framework for backends built with agents.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/@appweaver/influxdb" target="_blank"><img src="https://img.shields.io/npm/v/@appweaver/influxdb.svg" alt="NPM Version" /></a>
<a href="https://github.com/lmatosevic/appweaver/blob/main/LICENSE" target="_blank"><img src="https://img.shields.io/npm/l/@appweaver/influxdb.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/package/@appweaver/influxdb" target="_blank"><img src="https://img.shields.io/npm/dw/@appweaver/influxdb.svg" alt="NPM Downloads" /></a>
</p>

## Description

`@appweaver/influxdb` is the InfluxDB 3 time series store of [Appweaver](https://github.com/lmatosevic/appweaver), a
module enabled by installing it, which provides the `influxdb` `TimeSeries` provider. With `auto`, the default of the
`timeseries.provider` config key, it is selected whenever the module is installed, so the `series` fields of the
resource models are written to InfluxDB instead of the database.

The points of a model go to the table of its series (`<Model>Series`), the resource id as the `resourceId` tag and the
series fields as its fields. InfluxDB 3 Core, Enterprise and Cloud are supported, through the official
`@influxdata/influxdb3-client`. InfluxDB 3 deletes points only by the retention period of the database, so
`POST /:id/delete-series` responds with `501`, and the points of a deleted resource stay until the retention removes
them, no longer served by the routes.

## Installation

```sh
npm install @appweaver/influxdb
```

or `weaver module add timeseries-influxdb` in a project created with `@appweaver/create`.

The connection is configured in `timeseries.influxdb` (`TIMESERIES_INFLUXDB_HOST`, `TIMESERIES_INFLUXDB_TOKEN`,
`TIMESERIES_INFLUXDB_DATABASE`, ...).

## Documentation

- [Appweaver README](https://github.com/lmatosevic/appweaver#readme) – getting started, configuration, and the overview of every package
- [Agent skill](https://github.com/lmatosevic/appweaver/blob/main/skill/SKILL.md) – the complete framework reference shipped to every scaffolded project

## License

Appweaver is [MIT licensed](LICENSE).
