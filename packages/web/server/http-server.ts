import {
  LIFECYCLE,
  logger,
  OnReady,
  OnShutdown,
  ReadyOptions
} from '@appweaver/common';
import { Application, inject } from '@appweaver/core';
import { Server } from '../types/server';
import { createServer } from './create-server';
import { serverConfig } from './server-config';

/**
 * The HTTP server of the application, a lifecycle service of the `@appweaver/web` module. The server is created with
 * the service, once every module and file of the application is loaded, listens when the application is ready, and
 * closes before any service is destroyed.
 */
export class HttpServer implements OnReady, OnShutdown {
  static [LIFECYCLE] = true;

  /** The Fastify instance. */
  public readonly instance: Server = createServer();

  public async onReady(options: ReadyOptions): Promise<void> {
    if (options.startServer) {
      await this.listen();
    }
  }

  public async onShutdown(): Promise<void> {
    // The server stops accepting requests and waits for the in-flight ones
    // first, so none of them reaches an already destroyed service
    await this.instance.close();
  }

  /**
   * Starts listening on the configured host and port.
   *
   * @return {Promise<string>} The URL the server listens on.
   */
  public async listen(): Promise<string> {
    const address = await this.instance.listen({
      port: serverConfig.PORT,
      host: serverConfig.HOST
    });
    logger.debug(`Server listening on ${address}`);
    return address;
  }

  /**
   * Generates and returns the OpenAPI specification in JSON or YAML format.
   *
   * @param {'json' | 'yaml'} [format='json'] - The format in which to generate specification.
   * @return {Promise<string>} The JSON or YAML formatted OpenAPI specification.
   */
  public async spec(format: 'json' | 'yaml' = 'json'): Promise<string> {
    await this.instance.ready();

    const document = this.instance.swagger({ yaml: format === 'yaml' });

    if (typeof document === 'string') {
      return document;
    }

    return JSON.stringify(document, null, 4);
  }
}

declare module '@appweaver/core/app/application' {
  interface Application {
    /** The Fastify instance of the HTTP server, added by `@appweaver/web`. */
    readonly server: Server;

    /**
     * Generates and returns the OpenAPI specification in JSON or YAML format, added by `@appweaver/web`.
     *
     * @param {'json' | 'yaml'} [format='json'] - The format in which to generate specification.
     * @return {Promise<string>} The JSON or YAML formatted OpenAPI specification.
     */
    spec(format?: 'json' | 'yaml'): Promise<string>;
  }
}

// The application of core knows nothing of the server, which this module adds
Object.defineProperty(Application.prototype, 'server', {
  configurable: true,
  get: () => inject(HttpServer).instance
});
Application.prototype.spec = (format: 'json' | 'yaml' = 'json') =>
  inject(HttpServer).spec(format);
