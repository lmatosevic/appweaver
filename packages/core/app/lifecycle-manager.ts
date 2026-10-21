import {
  isLifecycleDestroy,
  isLifecycleInit,
  isLifecycleReady,
  isLifecycleShutdown,
  OnDestroy,
  OnInit,
  OnReady,
  OnShutdown,
  isConstructor
} from '@appweaver/common';
import { context } from '../context/context';
import { injectAllWhere } from '../context/dependency-injection';

export abstract class LifecycleManager {
  private _initialized = false;

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
    await Promise.all(
      injectAllWhere<OnInit>((def) => isLifecycleInit(def.value)).map(
        (service) => service.onInit()
      )
    );
    this._initialized = true;
  }

  /**
   * Tells the services that every service is initialized, i.e. so the server starts listening. The ready services are
   * created here, so a manager that is never ready, i.e. the seeder, never creates the server.
   *
   * @return A promise that resolves when all services are ready.
   */
  public async ready(): Promise<void> {
    await Promise.all(
      injectAllWhere<OnReady>((def) => isLifecycleReady(def.value)).map(
        (service) => service.onReady()
      )
    );
  }

  /**
   * Releases resources and cleans up any initialized services.
   * This method ensures that all registered services perform their individual cleanup operations.
   * The services stop serving requests first, so none of the requests in flight reaches a destroyed service.
   * Only the services already created are shut down and destroyed, since the others hold no resources.
   * It also sets the initialized state to false.
   *
   * @return A promise that resolves when all cleanup operations are completed.
   */
  public async destroy(): Promise<void> {
    await Promise.all(
      createdServices<OnShutdown>(isLifecycleShutdown).map((service) =>
        service.onShutdown()
      )
    );
    if (!this._initialized) {
      return;
    }
    await Promise.all(
      createdServices<OnDestroy>(isLifecycleDestroy).map((service) =>
        service.onDestroy()
      )
    );
    this._initialized = false;
  }
}

/** Returns the created instances of the definitions matching a lifecycle check, without creating the other ones. */
function createdServices<T>(matches: (value: unknown) => boolean): T[] {
  return context.definitions
    .map((def) => def.value)
    .filter((value) => !isConstructor(value) && matches(value)) as T[];
}
