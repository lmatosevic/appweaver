import {
  zstdDecompressSync,
  gunzipSync,
  brotliDecompressSync
} from 'node:zlib';
import { configOverrides } from '@appweaver/common';
import { resetContext } from '@appweaver/testing';
import { registerCompression } from '../../server/compression';
import { Server } from '../../types/server';
import { createTestServer } from '../fixtures/server-fixture';

const overrides = configOverrides;
const large = JSON.stringify(
  Array.from({ length: 200 }, (_, id) => ({ id, title: `Post ${id}` }))
);

describe('compression', () => {
  let server: Server;

  const start = async () => {
    server = createTestServer();
    registerCompression(server);
    server.after(() => {
      const json = async (_: unknown, reply: any) =>
        reply.type('application/json').send(large);
      server.get('/large', json);
      server.get('/small', async () => ({ ok: true }));
      server.get('/off', { config: { compress: false } }, json);
      server.get('/on', { config: { compress: true } }, json);
      server.get(
        '/brotli',
        { config: { compress: { encodings: ['br'], threshold: 4 } } },
        async () => ({ ok: true })
      );
      server.get('/auth/login', json);
      server.get('/auth/account/2fa/methods', json);
      server.get('/authors', json);
      server.get('/auth/login/open', { config: { compress: true } }, json);
      server.get('/no-transform', async (_, reply) =>
        reply
          .header('cache-control', 'no-transform')
          .type('application/json')
          .send(large)
      );
      server.get('/events', async (_, reply) =>
        reply.type('text/event-stream').send(large)
      );
      server.post('/echo', async (request) => request.body);
      server.get('/route', { compress: false }, async (_, reply) =>
        reply.type('application/json').send(large)
      );
    });
    await server.ready();
  };

  const get = (url: string, encoding = 'zstd, gzip, br') =>
    server.inject({
      method: 'GET',
      url,
      headers: { 'accept-encoding': encoding }
    });

  beforeEach(() => {
    resetContext();
  });

  afterEach(async () => {
    await server?.close();
    for (const key of Object.keys(overrides)) {
      if (key.startsWith('SERVER_COMPRESSION_')) {
        delete overrides[key];
      }
    }
  });

  afterAll(() => {
    resetContext();
  });

  describe('registerCompression', () => {
    test('compresses a large response with the first encoding the client accepts', async () => {
      await start();

      const zstd = await get('/large');
      expect(zstd.headers['content-encoding']).toBe('zstd');
      expect(zstdDecompressSync(zstd.rawPayload).toString()).toBe(large);

      const gzip = await get('/large', 'gzip');
      expect(gzip.headers['content-encoding']).toBe('gzip');
      expect(gunzipSync(gzip.rawPayload).toString()).toBe(large);
    });

    test('sends a response under the threshold, or for a client accepting none, as it is', async () => {
      await start();

      expect((await get('/small')).headers['content-encoding']).toBeUndefined();
      const plain = await get('/large', 'identity');
      expect(plain.headers['content-encoding']).toBeUndefined();
      expect(plain.body).toBe(large);
    });

    test('takes the compress option of the route config', async () => {
      await start();

      expect((await get('/off')).headers['content-encoding']).toBeUndefined();
      expect((await get('/on')).headers['content-encoding']).toBe('zstd');
      expect((await get('/route')).headers['content-encoding']).toBeUndefined();

      const brotli = await get('/brotli');
      expect(brotli.headers['content-encoding']).toBe('br');
      expect(
        JSON.parse(brotliDecompressSync(brotli.rawPayload).toString())
      ).toEqual({
        ok: true
      });
    });

    test('leaves the authentication routes uncompressed unless they set it', async () => {
      await start();

      expect(
        (await get('/auth/login')).headers['content-encoding']
      ).toBeUndefined();
      expect(
        (await get('/auth/account/2fa/methods')).headers['content-encoding']
      ).toBeUndefined();
      expect((await get('/authors')).headers['content-encoding']).toBe('zstd');
      expect((await get('/auth/login/open')).headers['content-encoding']).toBe(
        'zstd'
      );
    });

    test('never compresses an event stream or a no-transform response', async () => {
      await start();

      expect(
        (await get('/events')).headers['content-encoding']
      ).toBeUndefined();
      expect(
        (await get('/no-transform')).headers['content-encoding']
      ).toBeUndefined();
    });

    test('reads the threshold, the encodings and the levels of the config', async () => {
      overrides.SERVER_COMPRESSION_THRESHOLD = '64KB';
      await start();
      expect((await get('/large')).headers['content-encoding']).toBeUndefined();
      await server.close();

      delete overrides.SERVER_COMPRESSION_THRESHOLD;
      overrides.SERVER_COMPRESSION_ENCODINGS = ['gzip'];
      overrides.SERVER_COMPRESSION_LEVELS = { gzip: 1 };
      overrides.SERVER_COMPRESSION_SYNC_THRESHOLD = '0';
      overrides.SERVER_COMPRESSION_RESPECT_NO_TRANSFORM = false;
      await start();
      const gzip = await get('/large');
      expect(gzip.headers['content-encoding']).toBe('gzip');
      expect(gunzipSync(gzip.rawPayload).toString()).toBe(large);
      expect((await get('/no-transform')).headers['content-encoding']).toBe(
        'gzip'
      );
    });

    test('keeps the request bodies as they are sent', async () => {
      await start();

      const response = await server.inject({
        method: 'POST',
        url: '/echo',
        headers: { 'content-encoding': 'gzip', 'content-type': 'text/plain' },
        payload: 'plain'
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('plain');
    });
  });
});
