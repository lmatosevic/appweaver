import Fastify, { FastifyInstance } from 'fastify';
import { configOverrides } from '@appweaver/common';
import { registerJsonParser } from '../../server/json-parser';

describe('json-parser', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    configOverrides.SERVER_JSON_BODY_MAX_SIZE = '1KB';
    app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
    registerJsonParser(app);
    app.post('/', async (request) => request.body as any);
    await app.ready();
  });

  afterEach(async () => {
    delete configOverrides.SERVER_JSON_BODY_MAX_SIZE;
    await app.close();
  });

  describe('registerJsonParser', () => {
    const post = (payload: string) =>
      app.inject({
        method: 'POST',
        url: '/',
        headers: { 'content-type': 'application/json' },
        payload
      });

    test('parses a JSON body within the limit', async () => {
      const response = await post('{"title":"First"}');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ title: 'First' });
    });

    test('rejects a JSON body above the JSON limit, below the server limit', async () => {
      const response = await post(JSON.stringify({ text: 'x'.repeat(2048) }));

      expect(response.statusCode).toBe(413);
      expect(response.json().code).toBe('FST_ERR_CTP_BODY_TOO_LARGE');
    });

    test('rejects a prototype poisoning payload', async () => {
      const response = await post('{"__proto__":{"admin":true}}');

      expect(response.statusCode).toBe(400);
    });
  });
});
