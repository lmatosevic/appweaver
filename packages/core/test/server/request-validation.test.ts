import Fastify, { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import {
  closeSchema,
  requestValidation
} from '../../server/request-validation';

describe('request-validation', () => {
  describe('closeSchema', () => {
    test('closes an object schema declaring its properties', () => {
      expect(
        closeSchema({ type: 'object', properties: { a: { type: 'string' } } })
      ).toEqual({
        type: 'object',
        properties: { a: { type: 'string' } },
        additionalProperties: false
      });
    });

    test('keeps an explicit additionalProperties', () => {
      const open = {
        type: 'object',
        properties: {},
        additionalProperties: true
      };
      const typed = {
        type: 'object',
        properties: {},
        additionalProperties: { type: 'string' }
      };

      expect(closeSchema(open)).toEqual(open);
      expect(closeSchema(typed)).toEqual(typed);
    });

    test('leaves an object without properties open', () => {
      expect(closeSchema({ type: 'object' })).toEqual({ type: 'object' });
      expect(
        closeSchema({
          type: 'object',
          properties: {},
          patternProperties: { '^x': {} }
        })
      ).not.toHaveProperty('additionalProperties');
    });

    test('closes the nested object schemas', () => {
      const closed = closeSchema(
        Type.Object({
          list: Type.Array(Type.Object({ a: Type.String() })),
          either: Type.Union([Type.Object({ b: Type.String() }), Type.Null()])
        })
      );

      expect(closed.additionalProperties).toBe(false);
      expect(closed.properties.list.items.additionalProperties).toBe(false);
      expect(
        (closed.properties.either.anyOf[0] as any).additionalProperties
      ).toBe(false);
    });

    test('leaves the members of a combining allOf open', () => {
      const closed: any = closeSchema(
        Type.Intersect([
          Type.Object({ a: Type.String() }),
          Type.Object({ b: Type.Object({ c: Type.String() }) })
        ])
      );

      expect(closed.allOf[0]).not.toHaveProperty('additionalProperties');
      expect(closed.allOf[1]).not.toHaveProperty('additionalProperties');
      expect(closed.allOf[1].properties.b.additionalProperties).toBe(false);
    });

    test('closes the single member of an allOf', () => {
      const closed: any = closeSchema({
        allOf: [{ type: 'object', properties: { a: {} } }]
      });

      expect(closed.allOf[0].additionalProperties).toBe(false);
    });

    test('leaves the original schema unchanged', () => {
      const schema = Type.Object({ a: Type.Object({ b: Type.String() }) });

      closeSchema(schema);

      expect(schema).not.toHaveProperty('additionalProperties');
      expect(schema.properties.a).not.toHaveProperty('additionalProperties');
    });
  });

  describe('requestValidation', () => {
    let app: FastifyInstance | undefined;

    async function server(): Promise<FastifyInstance> {
      app = Fastify({ logger: false, ...requestValidation() });
      app.addSchema({
        $id: 'Shared',
        type: 'object',
        properties: { name: { type: 'string' } }
      });
      app.post(
        '/:id',
        {
          schema: {
            params: Type.Object({ id: Type.String() }),
            querystring: Type.Object({ q: Type.Optional(Type.String()) }),
            headers: Type.Object({ 'x-token': Type.String() }),
            body: Type.Object({
              shared: Type.Optional(Type.Ref('Shared')),
              meta: Type.Optional(
                Type.Object({}, { additionalProperties: true })
              )
            })
          }
        },
        async (request) => request.body
      );
      await app.ready();
      return app;
    }

    async function send(
      payload: unknown,
      query = ''
    ): Promise<{ status: number; body: any }> {
      const response = await (
        await server()
      ).inject({
        method: 'POST',
        url: `/1${query}`,
        headers: { 'x-token': 't', 'x-other': 'o' },
        payload: payload as any
      });
      return { status: response.statusCode, body: response.json() };
    }

    afterEach(async () => {
      await app?.close();
      app = undefined;
    });

    test('accepts the declared properties and any undeclared header', async () => {
      const { status, body } = await send(
        { shared: { name: 'a' }, meta: { any: 1 } },
        '?q=x'
      );

      expect(status).toBe(200);
      expect(body).toEqual({ shared: { name: 'a' }, meta: { any: 1 } });
    });

    test('rejects an undeclared body property', async () => {
      const { status, body } = await send({ other: 1 });

      expect(status).toBe(400);
      expect(body.message).toBe('body must NOT have additional properties');
    });

    test('rejects an undeclared property of a shared schema', async () => {
      const { status } = await send({ shared: { name: 'a', other: 1 } });

      expect(status).toBe(400);
    });

    test('rejects an undeclared query parameter', async () => {
      const { status, body } = await send({}, '?other=x');

      expect(status).toBe(400);
      expect(body.message).toBe(
        'querystring must NOT have additional properties'
      );
    });
  });
});
