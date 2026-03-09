import {
  config,
  isLifecycleDestroy,
  isLifecycleInit,
  logger,
  OnDestroy,
  OnInit
} from '@appweaver/common';
import { context, injectAllWhere } from '../context';
import { Server } from '../types';

/**
 * Represents an application that manages the lifecycle of a server and database.
 */
export class Application {
  private _started = false;
  private readonly _onInitServices = injectAllWhere<OnInit>((def) =>
    isLifecycleInit(def.value)
  );
  private readonly _onDestroyServices = injectAllWhere<OnDestroy>((def) =>
    isLifecycleDestroy(def.value)
  );

  constructor(private readonly _server: Server) {}

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
      throw new Error('Calling start() on already started application.');
    }

    this._started = true;

    logger.info(`Application started in "${config.APP_ENV}" environment`);

    await Promise.all([
      ...this._onInitServices.map((service) => service.onInit())
    ]);

    Object.freeze(context);

    // Add a termination handler for gracefully stopping the application
    process.on('SIGINT', async () => {
      await this.stop();
      process.exit(0);
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
      throw new Error(
        'Calling stop() on already stopped or not started application.'
      );
    }

    this._started = false;

    await Promise.all([
      ...this._onDestroyServices.map((service) => service.onDestroy())
    ]);

    await this._server.close();

    logger.info('Application stopped');
  }

  /**
   * Generates and returns the API documentation in JSON format.
   *
   * @return {Promise<string>} A promise that resolves to a JSON-formatted string containing the API documentation.
   */
  public async docs(): Promise<string> {
    await this._server.ready();
    const document = this._server.swagger();
    return JSON.stringify(document, null, 4);
  }
}
