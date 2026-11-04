import { defineModule, TimeSeries } from '@appweaver/common';
import { influxConfig } from './config';

/** The InfluxDB 3 time series store. */
export default defineModule({
  name: '@appweaver/influxdb',
  requires: ['@appweaver/data'],
  config: [influxConfig],
  loggers: ['timeseries'],
  providers: [
    {
      contract: TimeSeries,
      name: 'influxdb',
      load: () => import('./influx-time-series')
    }
  ]
});
