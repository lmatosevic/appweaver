import { FastifyReply } from 'fastify';
import { Static } from '@sinclair/typebox';

import { storageConfig, inject } from '@appweaver/core';
import { FileService, FileStream } from '@appweaver/data';
import {
  createFileAccessSchema,
  FileName,
  FileVersionQuery
} from './file-schema';
import { Server } from '../types/server';
import {
  contentDisposition,
  USER_CONTENT_SECURITY_POLICY
} from '../utils/http-util';

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
      contentDisposition('inline', data.fileName)
    );
    // The type of an upload is the one its client declared
    if (data.mimeType !== 'application/pdf') {
      reply.header('Content-Security-Policy', USER_CONTENT_SECURITY_POLICY);
    }
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

  server.get<{
    Params: Static<typeof FileName>;
    Querystring: Static<typeof FileVersionQuery>;
  }>(
    '/public/*',
    {
      schema: createFileAccessSchema(true)
    },
    async (request, reply) => {
      const data = await fileService.download(
        request.params['*'],
        request.headers.range,
        requestedVersion(request.query)
      );
      if ('url' in data) {
        return reply.redirect(data.url, 302);
      }

      const code = addHeaders(reply, data, !!request.headers.range);

      return reply.status(code).send(data.content.stream);
    }
  );

  server.get<{
    Params: Static<typeof FileName>;
    Querystring: Static<typeof FileVersionQuery>;
  }>(
    '/protected/*',
    {
      schema: createFileAccessSchema(false),
      onRequest: authenticate()
    },
    async (request, reply) => {
      const data = await fileService.download(
        request.params['*'],
        request.headers.range,
        requestedVersion(request.query)
      );
      if ('url' in data) {
        return reply.redirect(data.url, 302);
      }

      const code = addHeaders(reply, data, !!request.headers.range);

      return reply.status(code).send(data.content.stream);
    }
  );
}

/**
 * The version a file request asks for. Without file versions the query is not validated, so a version is passed on
 * as it is, for the file service to reject it.
 */
function requestedVersion(query?: {
  version?: number | string;
}): number | undefined {
  return query?.version === undefined ? undefined : Number(query.version);
}
