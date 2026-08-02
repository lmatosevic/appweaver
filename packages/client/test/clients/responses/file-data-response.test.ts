import { FileDataResponse } from '../../../clients/responses/file-data-response';

describe('file-data-response', () => {
  const streamOf = (...chunks: string[]): ReadableStream =>
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      }
    });

  const createResponse = (
    stream: ReadableStream,
    type: string = 'text/plain'
  ) =>
    new FileDataResponse({
      stream,
      fileName: 'notes.txt',
      type,
      length: 5
    });

  describe('constructor', () => {
    test('exposes the file metadata', () => {
      const file = new FileDataResponse({
        stream: streamOf('data'),
        fileName: 'report.pdf',
        type: 'application/pdf',
        length: 4,
        range: { start: 0, end: 3, total: 4 },
        maxAge: 60,
        expiresAt: 'Wed, 21 Oct 2026 07:28:00 GMT'
      });

      expect(file.fileName).toBe('report.pdf');
      expect(file.type).toBe('application/pdf');
      expect(file.length).toBe(4);
      expect(file.range).toEqual({ start: 0, end: 3, total: 4 });
      expect(file.maxAge).toBe(60);
      expect(file.expiresAt).toBe('Wed, 21 Oct 2026 07:28:00 GMT');
    });
  });

  describe('text', () => {
    test('decodes the whole stream', async () => {
      const file = createResponse(streamOf('hello'));
      await expect(file.text()).resolves.toBe('hello');
    });

    test('joins all stream chunks', async () => {
      const file = createResponse(streamOf('hello', ' ', 'world'));
      await expect(file.text()).resolves.toBe('hello world');
    });

    test('supports a custom encoding', async () => {
      const file = createResponse(streamOf('héllo'));
      await expect(file.text('utf-8')).resolves.toBe('héllo');
    });

    test('returns an empty string for an empty stream', async () => {
      const file = createResponse(streamOf());
      await expect(file.text()).resolves.toBe('');
    });
  });

  describe('buffer', () => {
    test('returns the raw bytes', async () => {
      const file = createResponse(streamOf('abc'));
      const buffer = await file.buffer();

      expect(buffer.byteLength).toBe(3);
      expect(Array.from(new Uint8Array(buffer))).toEqual([97, 98, 99]);
    });

    test('caches the buffer so the stream is only consumed once', async () => {
      const file = createResponse(streamOf('abc'));

      const first = await file.buffer();
      const second = await file.buffer();

      expect(second).toBe(first);
      await expect(file.text()).resolves.toBe('abc');
    });
  });

  describe('blob', () => {
    test('returns a blob with the file mime type', async () => {
      const file = createResponse(streamOf('abc'), 'text/csv');
      const blob = await file.blob();

      expect(blob.size).toBe(3);
      expect(blob.type).toBe('text/csv');
      await expect(blob.text()).resolves.toBe('abc');
    });
  });

  describe('base64', () => {
    test('returns a data URL with the base64 encoded content', async () => {
      const file = createResponse(streamOf('hello'), 'text/plain');

      await expect(file.base64()).resolves.toBe(
        `data:text/plain;base64,${Buffer.from('hello').toString('base64')}`
      );
    });

    test('encodes binary content', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([0, 1, 254, 255]));
          controller.close();
        }
      });
      const file = createResponse(stream, 'application/octet-stream');

      await expect(file.base64()).resolves.toBe(
        `data:application/octet-stream;base64,${Buffer.from([
          0, 1, 254, 255
        ]).toString('base64')}`
      );
    });
  });
});
