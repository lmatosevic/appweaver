import { FilesClient } from '../../../clients/modules/files-client';
import { ClientError } from '../../../errors';
import { createStubClient } from '../../fixtures/stub-client';

describe('files-client', () => {
  const fileResponse = (headers: Record<string, string>) =>
    new Response('file-content', { status: 200, headers });

  describe('public', () => {
    test('requests the file as a stream from the public path', async () => {
      const stub = createStubClient({
        response: fileResponse({ 'Content-Type': 'text/plain' })
      });
      const files = new FilesClient(stub.client, '/files');

      const file = await files.public('images/logo.png');

      expect(stub.lastCall()).toMatchObject({
        method: 'get',
        path: '/files/public/images/logo.png'
      });
      expect(stub.lastCall().params.parseAs).toBe('stream');
      await expect(file.text()).resolves.toBe('file-content');
    });

    test('falls back to the requested name when no filename header is present', async () => {
      const stub = createStubClient({
        response: fileResponse({ 'Content-Type': 'image/png' })
      });
      const files = new FilesClient(stub.client, '/files');

      const file = await files.public('logo.png');

      expect(file.fileName).toBe('logo.png');
      expect(file.type).toBe('image/png');
    });

    test('reads the file metadata from the response headers', async () => {
      const stub = createStubClient({
        response: fileResponse({
          'Content-Type': 'application/pdf',
          'Content-Length': '1024',
          'Content-Disposition': 'attachment; filename="report.pdf"',
          'Cache-Control': 'public, max-age=3600',
          'Content-Range': 'bytes 0-511/1024',
          Expires: 'Wed, 21 Oct 2026 07:28:00 GMT'
        })
      });
      const files = new FilesClient(stub.client, '/files');

      const file = await files.public('report.pdf');

      expect(file.fileName).toBe('report.pdf');
      expect(file.length).toBe(1024);
      expect(file.maxAge).toBe(3600);
      expect(file.range).toEqual({ start: 0, end: 511, total: 1024 });
      expect(file.expiresAt).toBe('Wed, 21 Oct 2026 07:28:00 GMT');
    });

    test('leaves the range undefined for a full content response', async () => {
      const stub = createStubClient({
        response: fileResponse({ 'Content-Type': 'text/plain' })
      });
      const files = new FilesClient(stub.client, '/files');

      const file = await files.public('notes.txt');

      expect(file.range).toBeUndefined();
      expect(file.maxAge).toBeUndefined();
      expect(file.length).toBe(0);
    });

    test('throws a ClientError when the file request fails', async () => {
      const stub = createStubClient({
        error: { message: 'File not found', errorCode: 404 },
        response: new Response(null, { status: 404 })
      });
      const files = new FilesClient(stub.client, '/files');

      await expect(files.public('missing.png')).rejects.toThrow(ClientError);
      await expect(files.public('missing.png')).rejects.toThrow(
        'File not found'
      );
    });

    test('falls back to the response status when the error has no code', async () => {
      const stub = createStubClient({
        error: {},
        response: new Response(null, {
          status: 500,
          statusText: 'Server Error'
        })
      });
      const files = new FilesClient(stub.client, '/files');

      await expect(files.public('boom.png')).rejects.toMatchObject({
        message: 'Server Error',
        errorCode: 500
      });
    });
  });

  describe('protected', () => {
    test('requests the file from the protected path', async () => {
      const stub = createStubClient({
        response: fileResponse({ 'Content-Type': 'text/plain' })
      });
      const files = new FilesClient(stub.client, '/files');

      await files.protected('private/notes.txt');

      expect(stub.lastCall()).toMatchObject({
        method: 'get',
        path: '/files/protected/private/notes.txt'
      });
    });
  });
});
