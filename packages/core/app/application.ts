import { appConfig, createLogger } from '@appweaver/common';
import { context } from '../context';
import { checkModuleConfig } from './discover-modules';
import { LifecycleManager } from './lifecycle-manager';

const logger = createLogger('app');

/**
 * Represents an application that manages the lifecycle of all defined services, the HTTP server among them when the
 * `@appweaver/web` module is enabled.
 */
export class Application extends LifecycleManager {
  private _started = false;
  /** The process handlers added on start, removed again on stop */
  private _processHandlers: [string, (...args: any[]) => void][] = [];

  /**
   * Starts the application by calling the onInit lifecycle methods of the services implementing the `OnInit`
   * interface, then the onReady methods of the `OnReady` ones, i.e. the server of `@appweaver/web` listening for
   * requests. It logs the start with the environment and the version of the application, and once every service is
   * ready, that the application started with the duration of the start. The application context is frozen after the
   * initialization to prevent further changes.
   *
   * @return {Promise<void>} A promise that resolves once the application is started.
   */
  public async start(): Promise<void> {
    if (this._started) {
      logger.warn('Trying to start already started application.');
      return;
    }

    logger.info(
      { env: appConfig.ENV, version: appConfig.VERSION },
      'Starting application'
    );

    checkModuleConfig();

    this._started = true;
    const start = performance.now();

    await this.init();

    Object.freeze(context);

    this.addProcessHandlers();

    await this.ready();

    logger.info(
      { durationMs: Math.round(performance.now() - start) },
      'Application started'
    );
  }

  /**
   * Stops the server by closing all active connections and releasing resources by calling onDestroy lifecycle
   * methods for services that implement the `OnDestroy` interface.
   * This method should be called to gracefully shut down the server.
   *
   * @return {Promise<void>} A promise that resolves when the server has been successfully stopped.
   */
  public async stop(): Promise<void> {
    if (!this._started) {
      logger.warn('Trying to stop already stopped or not started application.');
      return;
    }

    this._started = false;

    this.removeProcessHandlers();

    await this.destroy();

    logger.info('Application stopped');
  }

  /**
   * Adds the process handlers that stop the application gracefully on a termination signal, an unhandled rejection,
   * or an uncaught exception, and then exit the process.
   *
   * @internal
   */
  private addProcessHandlers(): void {
    const shutdown = async () => {
      await this.stop();
      process.exit(0);
    };

    const fail =
      (message: string, exitCode: number) => async (err: unknown) => {
        logger.fatal(err, message);
        try {
          await this.stop();
        } catch (e) {
          logger.error(e, `Error while trying to stop application`);
        }
        process.exit(exitCode);
      };

    this._processHandlers = [
      ['SIGTERM', shutdown],
      ['SIGINT', shutdown],
      ['unhandledRejection', fail('Unhandled rejection', 1)],
      ['uncaughtException', fail('Uncaught exception', 2)]
    ];

    for (const [event, handler] of this._processHandlers) {
      process.on(event, handler);
    }
  }

  /**
   * Removes the process handlers added on start, so a stopped application no longer reacts to the process events.
   *
   * @internal
   */
  private removeProcessHandlers(): void {
    for (const [event, handler] of this._processHandlers) {
      process.off(event, handler);
    }
    this._processHandlers = [];
  }
}
