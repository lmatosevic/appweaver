import Fastify, { FastifyInstance } from 'fastify';
import { Readable } from 'node:stream';
import { configOverrides } from '@appweaver/common';
import { define } from '@appweaver/core';
import { FileService } from '@appweaver/data';
import { resetContext } from '@appweaver/testing';
import { files } from '../../storage/file-route';
import { createFileAccessSchema } from '../../storage/file-schema';
import { requestValidation } from '../../server/request-validation';
import { errorHandler } from '../../errors/error-handler';
import { ProblemDetailsSchema } from '../../errors';

describe('file-route', () => {
  let app: FastifyInstance | undefined;
  const download = jest.fn();

  const server = async () => {
    app = Fastify({ logger: false, ...requestValidation() });
    app.decorate('authenticate', () => async () => {});
    app.addSchema(ProblemDetailsSchema);
    app.setErrorHandler(errorHandler);
    app.register(async (instance) => files(instance as any));
    await app.ready();
    return app;
  };

  beforeEach(() => {
    resetContext();
    download.mockResolvedValue({
      content: { size: 2, stream: Readable.from(['ok']) },
      fileName: 'a.txt',
      mimeType: 'text/plain',
      start: 0,
      end: 1
    });
    define({ download }, FileService as any);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    delete configOverrides.STORAGE_VERSIONS_ENABLED;
    jest.clearAllMocks();
  });

  describe('files', () => {
    test('downloads the current file without a version', async () => {
      await server();

      const response = await app!.inject({ url: '/public/a.txt' });

      expect(response.statusCode).toBe(200);
      expect(download).toHaveBeenCalledWith('a.txt', undefined, undefined);
    });

    test('downloads the version of the query', async () => {
      configOverrides.STORAGE_VERSIONS_ENABLED = true;
      await server();

      await app!.inject({ url: '/protected/a.txt?version=2' });

      expect(download).toHaveBeenCalledWith('a.txt', undefined, 2);
    });

    test('rejects a version that is not a whole number with file versions', async () => {
      configOverrides.STORAGE_VERSIONS_ENABLED = true;
      await server();

      const response = await app!.inject({ url: '/public/a.txt?version=0' });

      expect(response.statusCode).toBe(400);
      expect(download).not.toHaveBeenCalled();
    });

    test('passes a version on for the file service to reject without file versions', async () => {
      await server();

      await app!.inject({ url: '/public/a.txt?version=2' });

      expect(download).toHaveBeenCalledWith('a.txt', undefined, 2);
    });
  });

  describe('createFileAccessSchema', () => {
    test('documents the version query only with file versions', () => {
      expect(createFileAccessSchema(true).querystring).toBeUndefined();

      configOverrides.STORAGE_VERSIONS_ENABLED = true;

      expect(createFileAccessSchema(true).querystring).toBeDefined();
    });
  });
});
