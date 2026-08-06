import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parseSchemaUrl,
  readSchemaContent,
  toSchemaObject
} from '../../utils/schema-util';

describe('schema-util', () => {
  describe('parseSchemaUrl', () => {
    test('parses the supported URL protocols', () => {
      expect(parseSchemaUrl('https://example.com/openapi.json')?.protocol).toBe(
        'https:'
      );
      expect(
        parseSchemaUrl('http://localhost:3000/openapi.json')?.protocol
      ).toBe('http:');
      expect(parseSchemaUrl('file:///tmp/openapi.json')?.protocol).toBe(
        'file:'
      );
    });

    test('parses an unsupported protocol as a URL', () => {
      expect(parseSchemaUrl('ftp://example.com/openapi.json')?.protocol).toBe(
        'ftp:'
      );
    });

    test('treats a Windows drive letter path as a file path', () => {
      expect(parseSchemaUrl('C:\\projects\\api\\openapi.json')).toBeUndefined();
      expect(parseSchemaUrl('C:/projects/api/openapi.json')).toBeUndefined();
      expect(parseSchemaUrl('d:\\openapi.json')).toBeUndefined();
    });

    test('treats a relative path as a file path', () => {
      expect(parseSchemaUrl('./openapi.json')).toBeUndefined();
      expect(parseSchemaUrl('../schemas/openapi.json')).toBeUndefined();
      expect(parseSchemaUrl('openapi.json')).toBeUndefined();
    });

    test('treats a POSIX absolute path as a file path', () => {
      expect(parseSchemaUrl('/srv/api/openapi.json')).toBeUndefined();
    });
  });

  describe('readSchemaContent', () => {
    let tempDir: string;
    let schemaFile: string;
    let originalCwd: string;
    const content = '{"openapi":"3.0.3"}';

    beforeEach(() => {
      originalCwd = process.cwd();
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'appweaver-schema-'));
      schemaFile = path.join(tempDir, 'openapi.json');
      fs.writeFileSync(schemaFile, content, 'utf8');
      process.chdir(tempDir);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      fs.rmSync(tempDir, { recursive: true, force: true });
      jest.restoreAllMocks();
    });

    test('reads a schema from a relative file path', async () => {
      await expect(readSchemaContent('./openapi.json')).resolves.toBe(content);
    });

    test('reads a schema from a file URL', async () => {
      const fileUrl = pathToFileURL(schemaFile).toString();
      await expect(readSchemaContent(fileUrl)).resolves.toBe(content);
    });

    test('reads a schema from an absolute file path', async () => {
      await expect(readSchemaContent(schemaFile)).resolves.toBe(content);
    });

    test('rejects when the local file does not exist', async () => {
      await expect(readSchemaContent('./missing.json')).rejects.toThrow();
    });

    test('fetches a schema over http', async () => {
      const fetchMock = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(content, { status: 200 }));

      await expect(
        readSchemaContent('https://example.com/openapi.json')
      ).resolves.toBe(content);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/openapi.json'
      );
    });

    test('rejects when the schema URL is not reachable', async () => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('connection refused'));

      await expect(
        readSchemaContent('http://localhost:1/openapi.json')
      ).rejects.toThrow('Cannot access schema URL');
    });

    test('rejects when the response status is not ok', async () => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response('missing', { status: 404, statusText: 'Not Found' })
        );

      await expect(
        readSchemaContent('https://example.com/openapi.json')
      ).rejects.toThrow('Not Found');
    });
  });

  describe('toSchemaObject', () => {
    test('parses a JSON schema', async () => {
      const schema = await toSchemaObject(
        '{"openapi":"3.0.3","info":{"title":"API","version":"1.0.0"}}'
      );
      expect(schema.openapi).toBe('3.0.3');
      expect(schema.info.title).toBe('API');
    });

    test('parses a YAML schema', async () => {
      const schema = await toSchemaObject(
        ['openapi: 3.0.3', 'info:', '  title: API', '  version: 1.0.0'].join(
          '\n'
        )
      );
      expect(schema.openapi).toBe('3.0.3');
      expect(schema.info.title).toBe('API');
    });

    test('throws for content that is neither JSON nor YAML', async () => {
      await expect(toSchemaObject('{ this: is: not: valid }')).rejects.toThrow(
        'Unable to parse schema object in JSON or YAML format.'
      );
    });
  });
});
