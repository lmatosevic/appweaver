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

    // Add a termination handler for gracefully stopping the application
    process.on('SIGINT', async () => {
      await this.stop();
      process.exit(0);
    });

    // Add unhandled rejection handler
    process.on('unhandledRejection', async (err) => {
      logger.fatal(err, 'Unhandled rejection');
      try {
        await this.stop();
      } catch (e) {
        logger.error(e, `Error while trying to stop application`);
      }
      process.exit(1);
    });

    // Add uncaught exception handler
    process.on('uncaughtException', async (err) => {
      logger.fatal(err, 'Uncaught exception');
      try {
        await this.stop();
      } catch (e) {
        logger.error(e, `Error while trying to stop application`);
      }
      process.exit(2);
    });

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

    logger.info('Application stopped');

    this._started = false;

    await this.destroy();

    await this._server.close();
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
}
