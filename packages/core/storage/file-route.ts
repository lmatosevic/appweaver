import { FastifyReply } from 'fastify';
import { Static } from '@sinclair/typebox';
import { config } from '@appweaver/common';
import { fileService, FileStream } from './file-service';
import { createFileAccessSchema, FileName } from '../schema';
import { ServerInstance } from '../types';

export function files(server: ServerInstance): void {
  const { auth, authenticateJWT } = server;

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
      `public, max-age=${config.STORAGE_CACHE_DURATION}`
    );
    reply.header(
      'Expires',
      new Date(Date.now() + config.STORAGE_CACHE_DURATION).toUTCString()
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
      onRequest: auth([authenticateJWT])
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
