jest.mock('../sdk', () => ({ startTelemetry: jest.fn() }));

import { configOverrides } from '@appweaver/common';
import { startTelemetry } from '../sdk';
import { TelemetryService } from '../telemetry-service';

describe('telemetry-service', () => {
  const sdk = {
    forceFlush: jest.fn(async () => undefined),
    shutdown: jest.fn(async () => undefined)
  };
  let service: TelemetryService;

  beforeEach(() => {
    (startTelemetry as jest.Mock).mockResolvedValue(sdk);
    service = new TelemetryService();
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete configOverrides.TELEMETRY_ENABLED;
  });

  test('starts the SDK with the application and stops it with it', async () => {
    await service.onInit();
    expect(service.sdk).toBe(sdk);

    await service.forceFlush();
    expect(sdk.forceFlush).toHaveBeenCalledTimes(1);

    await service.onDestroy();
    expect(sdk.shutdown).toHaveBeenCalledTimes(1);
    expect(service.sdk).toBeUndefined();
  });

  test('never starts the SDK with telemetry disabled', async () => {
    configOverrides.TELEMETRY_ENABLED = false;

    await service.onInit();
    await service.forceFlush();
    await service.onDestroy();

    expect(startTelemetry).not.toHaveBeenCalled();
    expect(service.sdk).toBeUndefined();
  });

  test('stays without an SDK when another one is registered', async () => {
    (startTelemetry as jest.Mock).mockResolvedValue(undefined);

    await service.onInit();

    expect(service.sdk).toBeUndefined();
    await expect(service.onDestroy()).resolves.toBeUndefined();
  });
});
