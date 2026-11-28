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

    test('serves an upload sandboxed, whatever type its client declared', async () => {
      download.mockResolvedValue({
        content: { size: 2, stream: Readable.from(['<svg/>']) },
        fileName: 'logo.svg',
        mimeType: 'image/svg+xml',
        start: 0,
        end: 5
      });
      await server();

      const response = await app!.inject({ url: '/public/logo.svg' });

      expect(response.headers['content-security-policy']).toContain('sandbox');
      expect(response.headers['content-security-policy']).toContain(
        "default-src 'none'"
      );
      expect(response.headers['content-disposition']).toBe(
        'inline; filename="logo.svg"'
      );
    });

    test('leaves a PDF unsandboxed, which browsers would refuse to show', async () => {
      download.mockResolvedValue({
        content: { size: 2, stream: Readable.from(['%P']) },
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        start: 0,
        end: 1
      });
      await server();

      const response = await app!.inject({ url: '/public/report.pdf' });

      expect(response.headers['content-security-policy']).toBeUndefined();
    });

    test('serves a file whose name is outside Latin-1', async () => {
      download.mockResolvedValue({
        content: { size: 2, stream: Readable.from(['ok']) },
        fileName: 'łódź 東京.txt',
        mimeType: 'text/plain',
        start: 0,
        end: 1
      });
      await server();

      const response = await app!.inject({ url: '/public/a.txt' });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-disposition']).toBe(
        'inline; filename="_odz __.txt"; filename*=UTF-8\'\'%C5%82%C3%B3d%C5%BA%20%E6%9D%B1%E4%BA%AC.txt'
      );
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
