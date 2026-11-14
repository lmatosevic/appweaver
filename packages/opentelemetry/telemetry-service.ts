import {
  createLogger,
  LIFECYCLE,
  OnDestroy,
  OnInit,
  telemetryConfig
} from '@appweaver/common';
import { startTelemetry, TelemetrySdk } from './sdk';

const logger = createLogger('telemetry');

/**
 * The OpenTelemetry SDK of the application, a lifecycle service of the `@appweaver/opentelemetry` module: started
 * when the application starts, unless `telemetry.enabled` is `false`, and flushed and stopped when it stops.
 */
export class TelemetryService implements OnInit, OnDestroy {
  static [LIFECYCLE] = true;

  /** @internal */
  private _sdk?: TelemetrySdk;

  /** The started SDK with its providers, `undefined` while telemetry is disabled or another SDK is registered. */
  public get sdk(): TelemetrySdk | undefined {
    return this._sdk;
  }

  public async onInit(): Promise<void> {
    if (!telemetryConfig.ENABLED) {
      logger.debug('Telemetry is disabled');
      return;
    }
    this._sdk = await startTelemetry();
  }

  public async onDestroy(): Promise<void> {
    const sdk = this._sdk;
    this._sdk = undefined;
    await sdk?.shutdown();
  }

  /**
   * Exports the telemetry recorded so far, i.e. before a process exits without stopping the application.
   *
   * @return {Promise<void>} A promise that resolves once the telemetry is exported.
   */
  public async forceFlush(): Promise<void> {
    await this._sdk?.forceFlush();
  }
}
