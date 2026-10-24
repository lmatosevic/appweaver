import { FastifyReply } from 'fastify';
import { Static } from '@sinclair/typebox';

import { storageConfig } from './storage-config';
import { FileService, FileStream } from './file-service';
import { createFileAccessSchema, FileName } from './file-schema';
import { inject } from '../context';
import { Server } from '../types';

/**
 * Registers the routes streaming the public and the protected files, supporting byte range requests.
 *
 * @param {Server} server - The server to register the routes on.
 */
export function files(server: Server): void {
  const { authenticate } = server;

  const fileService = inject(FileService);

  const addHeaders = (
    reply: FastifyReply,
    data: FileStream,
    hasRange: boolean
  ): number => {
    reply.header('Accept-Ranges', 'bytes');

    if (hasRange) {
      reply.header(
        'Content-Range',
        `bytes ${data.start}-${data.end}/${data.content.size}`
      );
    }

    reply.header(
      'Content-Length',
      hasRange ? data.end - data.start + 1 : data.content.size
    );
    reply.header('Content-Type', data.mimeType ?? 'application/octet-stream');
    reply.header(
      'Content-Disposition',
      'inline; filename="' + data.fileName + '"'
    );
    reply.header('Pragma', 'public');
    reply.header(
      'Cache-Control',
      `public, max-age=${Math.floor(storageConfig.CACHE_TTL / 1000)}`
    );
    reply.header(
      'Expires',
      new Date(Date.now() + storageConfig.CACHE_TTL).toUTCString()
    );

    return hasRange ? 206 : 200;
  };

  server.get<{ Params: Static<typeof FileName> }>(
    '/public/*',
    {
      schema: createFileAccessSchema(true)
    },
    async (request, reply) => {
      const data = await fileService.stream(
        request.params['*'],
        request.headers.range
      );

      const code = addHeaders(reply, data, !!request.headers.range);

      return reply.status(code).send(data.content.stream);
    }
  );

  server.get<{ Params: Static<typeof FileName> }>(
    '/protected/*',
    {
      schema: createFileAccessSchema(false),
      onRequest: authenticate()
    },
    async (request, reply) => {
      const data = await fileService.stream(
        request.params['*'],
        request.headers.range
      );

      const code = addHeaders(reply, data, !!request.headers.range);

      return reply.status(code).send(data.content.stream);
    }
  );
}
