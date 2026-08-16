import { Type } from '@sinclair/typebox';
import Fastify, { FastifyInstance } from 'fastify';
import {
  QueryRequestData,
  QueryResponseData
} from '../../resource/resource-schema';

/**
 * Builds a server with the query request and response schemas the query route
 * uses. A response schema strips whatever it does not declare, which no service
 * level test would notice, so the two are exercised on routes of their own.
 */
async function server(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    ajv: {
      customOptions: { removeAdditional: 'all', allowUnionTypes: true },
      plugins: [(ajv): any => ajv.addKeyword('example')]
    }
  });

  const queryResponse = Type.Composite([
    QueryResponseData,
    Type.Object({ items: Type.Array(Type.Object({ id: Type.Number() })) })
  ]);

  // Serializes an unvalidated body with the response schema
  app.post(
    '/response',
    { schema: { response: { 200: queryResponse } } },
    async (request) => request.body as any
  );

  // Echoes the body the request schema validated, without serializing it
  app.post(
    '/request',
    { schema: { body: QueryRequestData } },
    async (request) => request.body as any
  );

  await app.ready();
  return app;
}

describe('resource-schema', () => {
  let app: FastifyInstance;

  const post = async (url: string, payload: any): Promise<any> => {
    const response = await app.inject({ method: 'POST', url, payload });
    return { status: response.statusCode, body: response.json() };
  };

  beforeEach(async () => {
    app = await server();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('QueryResponseData', () => {
    test('serializes the page cursors', async () => {
      const { status, body } = await post('/response', {
        resultCount: 2,
        totalCount: 10,
        nextCursor: 'next-cursor',
        prevCursor: 'prev-cursor',
        items: [{ id: 1 }, { id: 2 }]
      });

      expect(status).toBe(200);
      expect(body.nextCursor).toBe('next-cursor');
      expect(body.prevCursor).toBe('prev-cursor');
      expect(body.totalCount).toBe(10);
      expect(body.items).toEqual([{ id: 1 }, { id: 2 }]);
    });

    test('serializes the cursors of the pages that do not exist as null', async () => {
      const { body } = await post('/response', {
        resultCount: 2,
        totalCount: 2,
        nextCursor: null,
        prevCursor: null,
        items: []
      });

      // Present and null, so a client reads the absence off the response
      expect(body).toHaveProperty('nextCursor', null);
      expect(body).toHaveProperty('prevCursor', null);
      expect(body.resultCount).toBe(2);
    });

    test('serializes an uncounted query as a null total count', async () => {
      const { body } = await post('/response', {
        resultCount: 2,
        totalCount: null,
        nextCursor: 'next-cursor',
        prevCursor: null,
        items: []
      });

      expect(body).toHaveProperty('totalCount', null);
      expect(body.nextCursor).toBe('next-cursor');
    });
  });

  describe('QueryRequestData', () => {
    test('keeps the cursor and the count flag', async () => {
      const { status, body } = await post('/request', {
        size: 10,
        cursor: 'a-cursor',
        totalCount: false
      });

      expect(status).toBe(200);
      expect(body).toEqual({ size: 10, cursor: 'a-cursor', totalCount: false });
    });

    test('defaults the count flag to counting', async () => {
      const { body } = await post('/request', { size: 10 });

      expect(body.totalCount).toBe(true);
    });

    test('accepts the null cursor a response returned', async () => {
      const { status, body } = await post('/request', {
        size: 10,
        cursor: null
      });

      expect(status).toBe(200);
      expect(body.cursor).toBeNull();
    });

    test('strips the properties the schema does not declare', async () => {
      const { body } = await post('/request', { size: 10, unknown: 'value' });

      expect(body).not.toHaveProperty('unknown');
    });
  });
});
