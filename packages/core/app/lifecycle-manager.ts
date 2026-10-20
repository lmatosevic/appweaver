import {
  isLifecycleDestroy,
  isLifecycleInit,
  isLifecycleReady,
  isLifecycleShutdown,
  OnDestroy,
  OnInit,
  OnReady,
  OnShutdown,
  ReadyOptions
} from '@appweaver/common';
import { injectAllWhere } from '../context/dependency-injection';

export abstract class LifecycleManager {
  private _initialized = false;
  private readonly _initServices = injectAllWhere<OnInit>((def) =>
    isLifecycleInit(def.value)
  );
  private readonly _readyServices = injectAllWhere<OnReady>((def) =>
    isLifecycleReady(def.value)
  );
  private readonly _shutdownServices = injectAllWhere<OnShutdown>((def) =>
    isLifecycleShutdown(def.value)
  );
  private readonly _destroyServices = injectAllWhere<OnDestroy>((def) =>
    isLifecycleDestroy(def.value)
  );

  /**
   * Initializes the services and sets the initialized state.
   * This method ensures that the initialization logic is executed only once.
   *
   * @return A promise that resolves when all services have completed their initialization.
   */
  public async init(): Promise<void> {
    if (this._initialized) {
      return;
    }
    await Promise.all([
      ...this._initServices.map((service) => service.onInit())
    ]);
    this._initialized = true;
  }

  /**
   * Tells the services that every service is initialized, i.e. so the server starts listening.
   *
   * @param {ReadyOptions} options - The options of the application start.
   * @return A promise that resolves when all services are ready.
   */
  public async ready(options: ReadyOptions): Promise<void> {
    await Promise.all([
      ...this._readyServices.map((service) => service.onReady(options))
    ]);
  }

  /**
   * Releases resources and cleans up any initialized services.
   * This method ensures that all registered services perform their individual cleanup operations.
   * The services stop serving requests first, so none of the requests in flight reaches a destroyed service.
   * It also sets the initialized state to false.
   *
   * @return A promise that resolves when all cleanup operations are completed.
   */
  public async destroy(): Promise<void> {
    await Promise.all([
      ...this._shutdownServices.map((service) => service.onShutdown())
    ]);
    if (!this._initialized) {
      return;
    }
    await Promise.all([
      ...this._destroyServices.map((service) => service.onDestroy())
    ]);
    this._initialized = false;
  }
}
