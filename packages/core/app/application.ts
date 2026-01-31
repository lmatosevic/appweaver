import { FastifyInstance } from 'fastify';
import { config } from '@appweaver/common';

/**
 * Represents an application that manages the lifecycle of a Fastify server instance.
 */
export class Application {
  constructor(private readonly server: FastifyInstance) {}

  /**
   * Starts the server and begins listening on the specified host and port.
   *
   * @return {Promise<string>} A promise that resolves with the address where the server is running.
   */
  public async start(): Promise<string> {
    this.server.log.info(
      `Application started in "${config.APP_ENV}" environment`
    );
    return this.server.listen({
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
    await this.server.close();
  }

  /**
   * Generates and returns the API documentation in JSON format.
   *
   * @return {Promise<string>} A promise that resolves to a JSON-formatted string containing the API documentation.
   */
  public async docs(): Promise<string> {
    await this.server.ready();
    const document = this.server.swagger();
    return JSON.stringify(document, null, 4);
  }
}
