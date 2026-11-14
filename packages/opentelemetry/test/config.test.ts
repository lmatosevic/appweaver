import { configOverrides, Environment } from '@appweaver/common';
import {
  logsConfig,
  metricsConfig,
  openTelemetryConfig,
  OtlpProtocol,
  sdkInstrumentationsConfig,
  TelemetryExporter,
  tracesConfig
} from '../config';

describe('config', () => {
  afterEach(() => {
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  test('exports nothing in the test environment by default', () => {
    // Jest runs with NODE_ENV=test
    expect(openTelemetryConfig.EXPORTER).toBe(TelemetryExporter.None);
  });

  test('defaults to the traces and the metrics over OTLP protobuf, without the logs', () => {
    expect(openTelemetryConfig.PROTOCOL).toBe(OtlpProtocol.Protobuf);
    expect(openTelemetryConfig.TIMEOUT).toBe(10_000);
    expect(openTelemetryConfig.HEADERS).toEqual([]);
    expect(openTelemetryConfig.RESOURCE_ATTRIBUTES).toEqual([]);
    expect(tracesConfig).toMatchObject({ ENABLED: true, SAMPLE_RATIO: 1 });
    expect(metricsConfig).toMatchObject({ ENABLED: true, INTERVAL: 60_000 });
    expect(logsConfig).toMatchObject({ ENABLED: false, LEVEL: 'info' });
    expect(sdkInstrumentationsConfig.FETCH).toBe(true);
  });

  test('names the environment the exporter default depends on', () => {
    expect(Environment.Test).toBe('test');
  });
});
