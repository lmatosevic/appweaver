import {
  isLifecycleDestroy,
  isLifecycleInit,
  OnDestroy,
  OnInit
} from '@appweaver/common';
import { injectAllWhere } from '../context';

export abstract class LifecycleManager {
  private _initialized = false;
  private readonly _initServices = injectAllWhere<OnInit>((def) =>
    isLifecycleInit(def.value)
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
   * Releases resources and cleans up any initialized services.
   * This method ensures that all registered services perform their individual cleanup operations.
   * It also sets the initialized state to false.
   *
   * @return A promise that resolves when all cleanup operations are completed.
   */
  public async destroy(): Promise<void> {
    if (!this._initialized) {
      return;
    }
    await Promise.all([
      ...this._destroyServices.map((service) => service.onDestroy())
    ]);
    this._initialized = false;
  }
}
