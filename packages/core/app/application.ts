import { logger, appConfig } from '@appweaver/common';
import { context, inject } from '../context';
import { HttpServer } from '../server/http-server';
import { Server } from '../types';
import { LifecycleManager } from './lifecycle-manager';

/**
 * Represents an application that manages the lifecycle of all defined services, the HTTP server among them when the
 * `@appweaver/web` module is enabled.
 */
export class Application extends LifecycleManager {
  private _started = false;
  /** The process handlers added on start, removed again on stop */
  private _processHandlers: [string, (...args: any[]) => void][] = [];

  /**
   * Retrieves the Fastify instance of the HTTP server.
   *
   * @return {Server} The underlying Fastify server instance.
   * @throws {ContextError} When the `@appweaver/web` module is not enabled.
   */
  get server(): Server {
    return inject(HttpServer).instance;
  }

  /**
   * Starts the application by calling the onInit lifecycle methods of the services implementing the `OnInit`
   * interface, then the onReady methods of the `OnReady` ones, which start the server listening for requests. This
   * process also includes logging the environment in which the application is running, and freezing the application
   * context to prevent further changes.
   *
   * @param {boolean} [startServer=true] - Whether the server starts listening for requests.
   * @return {Promise<void>} A promise that resolves once the application is started.
   */
  public async start(startServer: boolean = true): Promise<void> {
    if (this._started) {
      logger.warn('Trying to start already started application.');
      return;
    }

    this._started = true;

    logger.info(`Application started in "${appConfig.ENV}" environment`);

    await this.init();

    Object.freeze(context);

    this.addProcessHandlers();

    await this.ready({ startServer });
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
   * Generates and returns the OpenAPI specification in JSON or YAML format.
   *
   * @param {'json' | 'yaml'} [format='json'] - The format in which to generate specification.
   * @return {Promise<string>} A promise that resolves to a JSON or YAML formatted string containing the OpenAPI
   * specification.
   * @throws {ContextError} When the `@appweaver/web` module is not enabled.
   */
  public async spec(format: 'json' | 'yaml' = 'json'): Promise<string> {
    return inject(HttpServer).spec(format);
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
