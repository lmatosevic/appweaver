import { config } from '@appweaver/common';
import { context, inject } from '../context';
import { Database } from '../database';
import { Server } from '../types';

/**
 * Represents an application that manages the lifecycle of a server and database.
 */
export class Application {
  private readonly _db: Database = inject(Database);

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

    await this._db.connect();

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
    await this._db.disconnect();
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
