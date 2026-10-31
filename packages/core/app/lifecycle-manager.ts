import {
  createLogger,
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
import { context, inject, injectAllWhere, injectCreated } from '../context';
import { HealthService } from '../health/health-service';

const logger = createLogger('app');

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
    const services = injectAllWhere<OnInit>((def) =>
      isLifecycleInit(def.value)
    );
    await runHooks('onInit', services, (service) => service.onInit());
    this._initialized = true;
  }

  /**
   * Tells the services that every service is initialized, i.e. so the server starts listening. The ready services are
   * created here, so a manager that is never ready, i.e. the seeder, never creates the server.
   *
   * @return A promise that resolves when all services are ready.
   */
  public async ready(): Promise<void> {
    const services = injectAllWhere<OnReady>((def) =>
      isLifecycleReady(def.value)
    );
    await runHooks('onReady', services, (service) => service.onReady());

    // Not before every hook completed, since the server listens while the other
    // services still start
    inject(HealthService, false)?.setReady(true);
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
    // The readiness probes fail while the requests in flight complete
    injectCreated(HealthService)?.setReady(false);

    const shutdownServices = createdServices<OnShutdown>(isLifecycleShutdown);

    await runHooks('onShutdown', shutdownServices, (service) =>
      service.onShutdown()
    );
    if (!this._initialized) {
      return;
    }

    const destroyServices = createdServices<OnDestroy>(isLifecycleDestroy);

    await runHooks('onDestroy', destroyServices, (service) =>
      service.onDestroy()
    );
    this._initialized = false;
  }
}

/** Runs a lifecycle hook of every service at once, logging how long the hook of each one took. */
async function runHooks<T extends object>(
  hook: string,
  services: T[],
  run: (service: T) => unknown
): Promise<void> {
  await Promise.all(
    services.map(async (service) => {
      const start = performance.now();
      await run(service);
      logger.debug(
        {
          service: service.constructor.name,
          hook,
          durationMs: Math.round(performance.now() - start)
        },
        'Service lifecycle hook completed'
      );
    })
  );
}

/** Returns the created instances of the definitions matching a lifecycle check, without creating the other ones. */
function createdServices<T>(matches: (value: unknown) => boolean): T[] {
  return context.definitions
    .map((def) => def.value)
    .filter((value) => !isConstructor(value) && matches(value)) as T[];
}
