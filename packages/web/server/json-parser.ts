import { FastifyInstance } from 'fastify';
import { textToBytes } from '@appweaver/common';
import { serverConfig } from './server-config';

/**
 * Replaces the JSON body parser of the server with one limited to `server.jsonBodyMaxSize`. A JSON body is parsed at
 * once on the event loop, so it gets a limit below the one of the uploads (`server.bodyMaxSize`). The prototype and
 * constructor poisoning are still rejected, like the default parser of Fastify does.
 *
 * @param {FastifyInstance} server - The server.
 */
export function registerJsonParser(server: FastifyInstance): void {
  server.removeContentTypeParser('application/json');
  server.addContentTypeParser(
    'application/json',
    {
      parseAs: 'string',
      bodyLimit: textToBytes(serverConfig.JSON_BODY_MAX_SIZE)
    },
    server.getDefaultJsonParser('error', 'error')
  );
}
