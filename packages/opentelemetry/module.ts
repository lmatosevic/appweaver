import { defineModule } from '@appweaver/common';
import {
  logsConfig,
  metricsConfig,
  openTelemetryConfig,
  sdkInstrumentationsConfig,
  tracesConfig
} from './config';

/** The OpenTelemetry SDK, exporting the traces, metrics and logs of the application. */
export default defineModule({
  name: '@appweaver/opentelemetry',
  config: [
    openTelemetryConfig,
    tracesConfig,
    metricsConfig,
    logsConfig,
    sdkInstrumentationsConfig
  ],
  loggers: ['telemetry'],
  services: [{ load: () => import('./telemetry-service') }]
});
