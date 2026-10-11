import Fastify, { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import {
  closeSchema,
  relevantErrors,
  requestValidation
} from '../../server/request-validation';

/** Creates a validation error the way the verbose validator reports it. */
const ajvError = (
  instancePath: string,
  keyword: string,
  params: Record<string, unknown> = {},
  extra: Record<string, unknown> = {}
): any => ({
  instancePath,
  schemaPath: `#/${keyword}`,
  keyword,
  params,
  message: `fails ${keyword}`,
  ...extra
});

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

  describe('relevantErrors', () => {
    const update = {
      type: 'object',
      properties: { id: {}, title: {} },
      required: ['id']
    };
    const create = {
      type: 'object',
      properties: { title: {}, slug: {} },
      required: ['title', 'slug']
    };

    test('keeps a single error unchanged, without the verbose fields', () => {
      const error = ajvError('/a', 'minimum', {}, { data: 1, schema: 2 });

      expect(relevantErrors([error])).toEqual([ajvError('/a', 'minimum', {})]);
    });

    test('drops the union summary error', () => {
      expect(
        relevantErrors([
          ajvError('/a', 'type', { type: 'string' }),
          ajvError('', 'anyOf')
        ])
      ).toEqual([
        expect.objectContaining({ instancePath: '/a', keyword: 'type' })
      ]);
    });

    test('prefers the error reaching deepest into the data', () => {
      const [error] = relevantErrors([
        ajvError('/item', 'additionalProperties', { additionalProperty: 'id' }),
        ajvError('/item/id', 'type', { type: 'integer' }),
        ajvError('/item', 'type', { type: 'integer' }),
        ajvError('/item', 'anyOf')
      ]);

      expect(error.instancePath).toBe('/item/id');
    });

    test('prefers the member holding the most of its required properties', () => {
      const data = { title: 'Fresh' };
      const [error] = relevantErrors([
        ajvError(
          '/item',
          'required',
          { missingProperty: 'id' },
          { data, parentSchema: update }
        ),
        ajvError(
          '/item',
          'required',
          { missingProperty: 'slug' },
          { data, parentSchema: create }
        ),
        ajvError('/item', 'anyOf')
      ]);

      expect(error.params).toEqual({ missingProperty: 'slug' });
    });

    test('prefers an undeclared property over a missing one', () => {
      const data = { id: 1, slug: 'x' };
      const [error] = relevantErrors([
        ajvError(
          '/item',
          'required',
          { missingProperty: 'title' },
          { data, parentSchema: create }
        ),
        ajvError(
          '/item',
          'additionalProperties',
          { additionalProperty: 'slug' },
          { data, parentSchema: update }
        ),
        ajvError('/item', 'anyOf')
      ]);

      expect(error.params).toEqual({ additionalProperty: 'slug' });
    });

    test('prefers an object member over a type mismatch', () => {
      const [error] = relevantErrors([
        ajvError('/item', 'type', { type: 'integer' }),
        ajvError(
          '/item',
          'additionalProperties',
          { additionalProperty: 'x' },
          { data: { x: 1 }, parentSchema: { properties: {} } }
        ),
        ajvError('/item', 'anyOf')
      ]);

      expect(error.keyword).toBe('additionalProperties');
    });

    test('keeps the other errors of the most relevant member', () => {
      const data = { title: 'Fresh', bogus: 1 };
      const errors = relevantErrors(
        [
          ajvError(
            '/item',
            'required',
            { missingProperty: 'id' },
            { data, parentSchema: update }
          ),
          ajvError(
            '/item',
            'required',
            { missingProperty: 'slug' },
            { data, parentSchema: create }
          ),
          ajvError(
            '/item',
            'additionalProperties',
            { additionalProperty: 'bogus' },
            { data, parentSchema: create }
          ),
          ajvError('/item', 'anyOf')
        ],
        20
      );

      expect(errors.map((e) => e.params)).toEqual([
        { missingProperty: 'slug' },
        { additionalProperty: 'bogus' }
      ]);
    });

    test('keeps the errors outside of a union, up to the limit', () => {
      const errors = [
        ajvError('', 'additionalProperties', { additionalProperty: 'a' }),
        ajvError('/b', 'type', { type: 'string' }),
        ajvError('/c', 'type', { type: 'object' }),
        ajvError('/c', 'type', { type: 'integer' }),
        ajvError('/c', 'anyOf'),
        ajvError('/d', 'minimum')
      ];

      expect(relevantErrors(errors, 20).map((e) => e.instancePath)).toEqual([
        '',
        '/b',
        '/c',
        '/d'
      ]);
      expect(relevantErrors(errors, 2).map((e) => e.instancePath)).toEqual([
        '',
        '/b'
      ]);
    });

    test('reduces a nested union before the union holding it', () => {
      const errors = relevantErrors(
        [
          ajvError('/a', 'type', { type: 'string' }),
          ajvError('/a/x', 'type', { type: 'string' }),
          ajvError('/a/x', 'type', { type: 'array' }),
          ajvError('/a/x', 'anyOf'),
          ajvError('/a', 'anyOf')
        ],
        20
      );

      expect(errors).toEqual([
        expect.objectContaining({
          instancePath: '/a/x',
          message: 'must be string or array'
        })
      ]);
    });

    test('merges the type mismatches of the same position', () => {
      const [error] = relevantErrors([
        ajvError('/item', 'type', { type: 'object' }),
        ajvError('/item', 'type', { type: 'integer' }),
        ajvError('/item', 'type', { type: 'integer,null' }),
        ajvError('/item', 'anyOf')
      ]);

      expect(error.message).toBe('must be object, integer or null');
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

    test('reports every failure of a request part', async () => {
      const { body } = await send({ other: 1, shared: { name: 5, more: 1 } });

      expect(body.message).toBe(
        'body must NOT have additional properties, ' +
          'body/shared must NOT have additional properties'
      );
    });

    test('stops at the first failure with an error count of 1', async () => {
      app = Fastify({ logger: false, ...requestValidation(1) });
      app.post(
        '/',
        {
          schema: {
            body: Type.Object({ a: Type.String(), b: Type.String() })
          }
        },
        async () => ({})
      );

      const response = await app.inject({
        method: 'POST',
        url: '/',
        payload: { c: 1, d: 2 }
      });

      expect(response.json().message).toBe(
        "body must have required property 'a'"
      );
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
