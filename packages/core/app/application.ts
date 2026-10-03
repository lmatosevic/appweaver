import { config, logger } from '@appweaver/common';
import { context } from '../context';
import { Server } from '../types';
import { LifecycleManager } from './lifecycle-manager';

/**
 * Represents an application that manages the lifecycle of a server and all
 * defined services.
 */
export class Application extends LifecycleManager {
  private _started = false;
  /** The process handlers added on start, removed again on stop */
  private _processHandlers: [string, (...args: any[]) => void][] = [];

  constructor(private readonly _server: Server) {
    super();
  }

  /**
   * Retrieves the Fastify instance.
   *
   * @return {Server} The underlying Fastify server instance.
   */
  get server(): Server {
    return this._server;
  }

  /**
   * Starts the application by initializing the server and calls onInit lifecycle methods for
   * services that implement the `OnInit` interface. This process also includes logging the environment
   * in which the application is running, freezing the application context to prevent further changes,
   * and starting a server to listen for incoming requests.
   *
   * @return {Promise<string>} A promise that resolves to a string denoting the server URL on a successful start or
   * empty string if server was not started.
   */
  public async start(startServer: boolean = true): Promise<string> {
    if (this._started) {
      logger.warn('Trying to start already started application.');
      return this._server.addresses()[0]?.address ?? '';
    }

    this._started = true;

    logger.info(`Application started in "${config.APP_ENV}" environment`);

    await this.init();

    Object.freeze(context);

    this.addProcessHandlers();

    if (startServer) {
      return this._server.listen({
        port: config.SERVER_PORT,
        host: config.SERVER_HOST
      });
    }

    return '';
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

    // The server stops accepting requests and waits for the in-flight ones
    // first, so none of them reaches an already destroyed service
    await this._server.close();

    await this.destroy();

    logger.info('Application stopped');
  }

  /**
   * Generates and returns the OpenAPI specification in JSON or YAML format.
   *
   * @param {'json' | 'yaml'} [format='json'] - The format in which to generate specification.
   * @return {Promise<string>} A promise that resolves to a JSON or YAML formatted string containing the OpenAPI
   * specification.
   */
  public async spec(format: 'json' | 'yaml' = 'json'): Promise<string> {
    await this._server.ready();

    const document = this._server.swagger({ yaml: format === 'yaml' });

    if (typeof document === 'string') {
      return document;
    }

    return JSON.stringify(document, null, 4);
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
