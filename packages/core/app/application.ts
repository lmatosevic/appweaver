import { config } from '@appweaver/common';
import { db } from '../database';
import { context } from '../context';
import { ServerInstance } from '../types';

/**
 * Represents an application that manages the lifecycle of a Fastify server instance.
 */
export class Application {
  constructor(private readonly _server: ServerInstance) {}

  /**
   * Retrieves the Fastify instance.
   *
   * @return {ServerInstance} The underlying Fastify server instance.
   */
  get server(): ServerInstance {
    return this._server;
  }

  /**
   * Starts the application by initializing the server and connecting to the database.
   * This process includes logging the environment in which the application is running,
   * establishing a database connection, freezing the application context to prevent
   * further changes, and starting a server to listen for incoming requests.
   *
   * @return {Promise<string>} A promise that resolves to a string denoting the server URL on a successful start.
   */
  public async start(): Promise<string> {
    this._server.log.info(
      `Application started in "${config.APP_ENV}" environment`
    );

    await db.connect();

    Object.freeze(context);

    return this._server.listen({
      port: config.SERVER_PORT,
      host: config.SERVER_HOST
    });
  }

  /**
   * Stops the server by closing all active connections and releasing resources.
   * This method should be called to gracefully shut down the server.
   *
   * @return {Promise<void>} A promise that resolves when the server has been successfully stopped.
   */
  public async stop(): Promise<void> {
    await db.disconnect();
    await this._server.close();
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
