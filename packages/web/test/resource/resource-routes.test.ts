import Fastify, { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import * as common from '@appweaver/common';
import {
  ErrorCode,
  QueryMethod,
  ResourceRoutesConfig,
  AuthError,
  ResourceError,
  TurnstileError
} from '@appweaver/common';
import { context } from '@appweaver/core/internal';
import { define } from '@appweaver/core';
import { createModel } from '@appweaver/data';
import { resourceRoutes } from '../../resource/resource-routes';
import { errorHandler } from '../../errors/error-handler';
import { ProblemDetailsSchema } from '../../errors';
import schemas from '../../server/schemas';
import { resetContext } from '@appweaver/testing';
import { linkModels } from '@appweaver/testing';
import { requestValidation } from '../../server/request-validation';
import { referencedSerializer } from '../../server/response-serialization';

const queryResponse = {
  resultCount: 0,
  totalCount: 0,
  nextCursor: null,
  prevCursor: null,
  items: []
};

const aggregateResponse = { total: {}, items: [] };

/**
 * Wraps a compiler factory of the server, so a route schema is compiled once
 * for all the servers of the tests rather than once for each one. A compiled
 * function depends only on the shared schemas, the options and the route, so
 * it is keyed by their JSON.
 */
function cached<F extends (...args: any[]) => (route: any) => unknown>(
  factory: F
): F {
  const compiled = new Map<string, unknown>();
  return ((externalSchemas: unknown, options: unknown) => {
    const prefix = JSON.stringify([externalSchemas, options]);
    let compile: ((route: unknown) => unknown) | undefined;
    return (route: unknown) => {
      const key = prefix + JSON.stringify(route);
      if (!compiled.has(key)) {
        compile ??= factory(externalSchemas, options);
        compiled.set(key, compile(route));
      }
      return compiled.get(key);
    };
  }) as F;
}

const buildValidator = cached(
  requestValidation().schemaController!.compilersFactory!.buildValidator!
);
const buildSerializer = cached(referencedSerializer());

const postResponse = {
  id: 1,
  title: 'Title',
  views: 1,
  publishedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdById: null
};

/**
 * Mounts the resource routes of the `Post` model on a server with the
 * validation options of the application server, answering from a stub service
 * that records the options each route passed to it.
 */
async function server(
  routesConfig: Omit<ResourceRoutesConfig, 'modelName' | 'path'> = {},
  swagger: boolean = false,
  denyAuth: boolean = false
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    ...requestValidation(),
    schemaController: {
      compilersFactory: { buildValidator, buildSerializer }
    }
  });

  define({ instance: app }, 'HttpServer', 'override');

  // Rejecting every request that is authenticated tells the public routes apart
  app.decorate('authenticate', () => async () => {
    if (denyAuth) {
      throw new AuthError(ErrorCode.AuthUnauthorized, 'Unauthorized');
    }
  });
  app.decorate('recaptcha', async () => {});
  // Accepts a request carrying any token, as the verification is not tested here
  app.decorate('turnstile', async (request: any) => {
    if (!request.headers['x-turnstile-token']) {
      throw new TurnstileError(ErrorCode.TurnstileMissing, 'Missing', {
        header: 'x-turnstile-token'
      });
    }
  });
  app.setErrorHandler(errorHandler);

  // Registered at import time, before each test cleared the context
  app.addSchema(ProblemDetailsSchema);

  if (swagger) {
    await app.register(fastifySwagger, {
      openapi: {
        components: {
          securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } }
        }
      }
    });
  }

  app.register(schemas);
  app.register(resourceRoutes('Post', routesConfig), {
    prefix: '/posts'
  });

  await app.ready();
  return app;
}

describe('resource-routes', () => {
  let app: FastifyInstance | undefined;
  let service: {
    query: jest.Mock;
    aggregate: jest.Mock;
    update: jest.Mock;
    replace: jest.Mock;
    bulkCreate: jest.Mock;
    bulkUpdate: jest.Mock;
    bulkReplace: jest.Mock;
    bulkDelete: jest.Mock;
  };

  const request = async (
    method: 'GET' | 'POST',
    url: string,
    payload?: any
  ): Promise<{ status: number; body: any }> => {
    const response = await app!.inject({ method, url, payload });
    return { status: response.statusCode, body: response.json() };
  };

  const queryString = (params: Record<string, unknown>): string =>
    new URLSearchParams(
      Object.entries(params).map(([key, value]) => [
        key,
        typeof value === 'string' ? value : JSON.stringify(value)
      ])
    ).toString();

  /** The route names a request of every method reached, in a fixed order. */
  const reached = async (): Promise<string[]> => {
    const requests: [string, 'GET' | 'POST', string, any?][] = [
      ['GET /query', 'GET', '/posts/query'],
      ['POST /query', 'POST', '/posts/query', {}],
      ['GET /aggregate', 'GET', '/posts/aggregate?select={}'],
      ['POST /aggregate', 'POST', '/posts/aggregate', { select: {} }]
    ];

    const routes: string[] = [];
    for (const [route, method, url, payload] of requests) {
      service.query.mockClear();
      service.aggregate.mockClear();

      // A GET request missing its route falls through to GET /:id
      await request(method, url, payload);

      if (
        service.query.mock.calls.length ||
        service.aggregate.mock.calls.length
      ) {
        routes.push(route);
      }
    }
    return routes;
  };

  beforeEach(() => {
    resetContext();

    createModel({
      name: 'Post',
      scalars: {
        title: { type: 'string' },
        views: { type: 'int' },
        publishedAt: { type: 'dateTime' }
      }
    });
    linkModels();

    service = {
      query: jest.fn().mockResolvedValue(queryResponse),
      aggregate: jest.fn().mockResolvedValue(aggregateResponse),
      update: jest.fn().mockResolvedValue(postResponse),
      replace: jest.fn().mockResolvedValue(postResponse),
      bulkCreate: jest.fn(async (items: any[]) =>
        items.map(() => postResponse)
      ),
      bulkUpdate: jest.fn(async (items: any[]) =>
        items.map(() => postResponse)
      ),
      bulkReplace: jest.fn(async (items: any[]) =>
        items.map(() => postResponse)
      ),
      bulkDelete: jest.fn(async (ids: any[]) => ids.map(() => postResponse))
    };
    context.resource.services.set('Post', service as any);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    delete (common as any).configOverrides.RESOURCE_QUERY_METHOD;
    delete (common as any).configOverrides.RESOURCE_AGGREGATE_METHOD;
    delete (common as any).configOverrides.SECURITY_TURNSTILE_ENABLED;
    delete (common as any).configOverrides.RESOURCE_BULK_MAX_ITEMS;
    delete (common as any).configOverrides.RESOURCE_BULK_CREATE_ENABLED;
    delete (common as any).configOverrides.RESOURCE_BULK_UPDATE_ENABLED;
    delete (common as any).configOverrides.RESOURCE_BULK_DELETE_ENABLED;
    delete (common as any).configOverrides.RESOURCE_BULK_RETURN_RECORDS;
  });

  describe('resourceRoutes', () => {
    describe('route methods', () => {
      test('registers only the POST routes by default', async () => {
        app = await server();

        expect(await reached()).toEqual(['POST /query', 'POST /aggregate']);
      });

      test('registers only the GET routes for the get method', async () => {
        app = await server({
          query: { method: 'get' },
          aggregate: { method: QueryMethod.Get }
        });

        expect(await reached()).toEqual(['GET /query', 'GET /aggregate']);
      });

      test('registers both routes for the get-post method', async () => {
        app = await server({
          query: { method: 'get-post' },
          aggregate: { method: 'get-post' }
        });

        expect(await reached()).toEqual([
          'GET /query',
          'POST /query',
          'GET /aggregate',
          'POST /aggregate'
        ]);
      });

      test('configures the query and aggregate routes independently', async () => {
        app = await server({ query: { method: 'get' } });

        expect(await reached()).toEqual(['GET /query', 'POST /aggregate']);
      });

      test('falls back to the RESOURCE_QUERY_METHOD config', async () => {
        (common as any).configOverrides.RESOURCE_QUERY_METHOD = QueryMethod.Get;
        app = await server();

        expect(await reached()).toEqual(['GET /query', 'POST /aggregate']);
      });

      test('falls back to the RESOURCE_AGGREGATE_METHOD config', async () => {
        (common as any).configOverrides.RESOURCE_AGGREGATE_METHOD =
          QueryMethod.GetPost;
        app = await server();

        expect(await reached()).toEqual([
          'POST /query',
          'GET /aggregate',
          'POST /aggregate'
        ]);
      });

      test('prefers the route method over the config', async () => {
        (common as any).configOverrides.RESOURCE_QUERY_METHOD = QueryMethod.Get;
        (common as any).configOverrides.RESOURCE_AGGREGATE_METHOD =
          QueryMethod.Get;
        app = await server({
          query: { method: 'post' },
          aggregate: { method: 'get-post' }
        });

        expect(await reached()).toEqual([
          'POST /query',
          'GET /aggregate',
          'POST /aggregate'
        ]);
      });

      test('registers no route of an excluded resource route', async () => {
        app = await server({
          query: { method: 'get-post', exclude: true },
          aggregate: { method: 'get-post', exclude: true }
        });

        expect(await reached()).toEqual([]);
      });
    });

    describe('route defaults', () => {
      const status = async (
        method: 'GET' | 'POST',
        url: string,
        payload?: any
      ) => (await request(method, url, payload)).status;

      test('applies the default method to the query and aggregate routes', async () => {
        app = await server({ defaults: { method: 'get' } });

        expect(await reached()).toEqual(['GET /query', 'GET /aggregate']);
      });

      test('prefers the method a route sets', async () => {
        app = await server({
          defaults: { method: 'get-post' },
          aggregate: { method: 'post' }
        });

        expect(await reached()).toEqual([
          'GET /query',
          'POST /query',
          'POST /aggregate'
        ]);
      });

      test('excludes every route the defaults exclude, unless included again', async () => {
        app = await server({
          defaults: { exclude: true },
          query: { exclude: false }
        });

        expect(await reached()).toEqual(['POST /query']);
        expect(await status('GET', '/posts/1')).toBe(404);
      });

      test('applies the default access, unless a route sets its own', async () => {
        app = await server(
          { defaults: { public: true }, query: { roles: ['Admin'] } },
          false,
          true
        );

        expect(await status('POST', '/posts/aggregate', { select: {} })).toBe(
          200
        );
        expect(await status('POST', '/posts/query', {})).toBe(401);
      });
    });

    describe('update routes', () => {
      const full = {
        title: 'Title',
        views: 1,
        publishedAt: postResponse.publishedAt
      };

      const send = async (method: 'PUT' | 'PATCH', payload: any) => {
        service.update.mockClear();
        service.replace.mockClear();
        const response = await app!.inject({
          method,
          url: '/posts/1',
          payload
        });
        return { status: response.statusCode, body: response.json() };
      };

      /** The update routes registered, told apart by the service method they call. */
      const updateRoutes = async (): Promise<string[]> => {
        const routes: string[] = [];
        if ((await send('PUT', full)).status === 200) {
          routes.push('PUT');
        }
        if ((await send('PATCH', full)).status === 200) {
          routes.push('PATCH');
        }
        return routes;
      };

      test('registers both routes', async () => {
        app = await server();

        expect(await updateRoutes()).toEqual(['PUT', 'PATCH']);
      });

      test('ignores the query method of the route defaults', async () => {
        app = await server({ defaults: { method: 'get' } });

        expect(await updateRoutes()).toEqual(['PUT', 'PATCH']);
      });

      test('registers no route of an excluded update route', async () => {
        app = await server({ update: { exclude: true } });

        expect(await updateRoutes()).toEqual([]);
      });

      test('excludes only the replace route, or registers it alone', async () => {
        app = await server({ replace: { exclude: true } });
        expect(await updateRoutes()).toEqual(['PATCH']);
        await app.close();

        app = await server({
          update: { exclude: true },
          replace: { exclude: false }
        });
        expect(await updateRoutes()).toEqual(['PUT']);
      });

      test('applies the update access to the replace route, unless it sets its own', async () => {
        app = await server({ update: { public: true } }, false, true);
        expect(await updateRoutes()).toEqual(['PUT', 'PATCH']);
        await app.close();

        app = await server(
          { update: { public: true }, replace: { roles: ['Admin'] } },
          false,
          true
        );
        expect(await updateRoutes()).toEqual(['PATCH']);
      });

      test('updates the given fields with PATCH', async () => {
        app = await server();

        const { status } = await send('PATCH', { title: 'Patched' });

        expect(status).toBe(200);
        expect(service.update).toHaveBeenCalledWith(1, { title: 'Patched' });
        expect(service.replace).not.toHaveBeenCalled();
      });

      test('replaces the resource with PUT', async () => {
        app = await server();

        const { status } = await send('PUT', full);

        expect(status).toBe(200);
        expect(service.replace).toHaveBeenCalledWith(1, full);
        expect(service.update).not.toHaveBeenCalled();
      });

      test('rejects a PUT body missing a required field', async () => {
        app = await server();

        const { status, body } = await send('PUT', { title: 'Title' });

        expect(status).toBe(400);
        expect(body.code).toBe(ErrorCode.ValidationFailed);
        expect(service.replace).not.toHaveBeenCalled();
      });

      test('documents both operations on the same path', async () => {
        app = await server({}, true);
        const document = (app as any).swagger();

        const item = document.paths['/posts/{id}'];
        expect(Object.keys(item)).toEqual(
          expect.arrayContaining(['put', 'patch'])
        );
        expect(item.put.summary).toBe('Replace post data');
        expect(item.patch.summary).toBe('Update post data');
      });
    });

    describe('bulk routes', () => {
      const full = {
        title: 'Title',
        views: 1,
        publishedAt: postResponse.publishedAt
      };

      const send = async (
        method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        payload: any
      ) => {
        const response = await app!.inject({
          method,
          url: '/posts/bulk',
          payload
        });
        return { status: response.statusCode, body: response.json() };
      };

      const enabled = { exclude: false };
      const all = {
        bulkCreate: enabled,
        bulkUpdate: enabled,
        bulkDelete: enabled
      };

      test('registers no bulk route by default', async () => {
        app = await server();

        expect((await send('POST', [full])).status).toBe(404);
        // The single routes take the path as an id, which fails validation
        expect((await send('DELETE', [1])).status).toBe(400);
        expect((await send('PATCH', [])).status).toBe(400);
        expect((await send('PUT', [])).status).toBe(400);
        expect(service.bulkCreate).not.toHaveBeenCalled();
        expect(service.bulkDelete).not.toHaveBeenCalled();
      });

      test('registers the bulk routes the config enables', async () => {
        (common as any).configOverrides.RESOURCE_BULK_CREATE_ENABLED = true;
        (common as any).configOverrides.RESOURCE_BULK_DELETE_ENABLED = true;
        app = await server();

        expect((await send('POST', [full])).status).toBe(201);
        expect((await send('DELETE', [1])).status).toBe(200);
        // The bulk update routes stay disabled, so PATCH reaches PATCH /:id
        expect((await send('PATCH', [{ id: 1, data: {} }])).status).toBe(400);
        expect(service.bulkUpdate).not.toHaveBeenCalled();
      });

      test('prefers the exclude option of a bulk route over the config', async () => {
        (common as any).configOverrides.RESOURCE_BULK_CREATE_ENABLED = true;
        (common as any).configOverrides.RESOURCE_BULK_UPDATE_ENABLED = false;
        app = await server({
          bulkCreate: { exclude: true },
          bulkUpdate: { exclude: false }
        });

        expect((await send('POST', [full])).status).toBe(404);
        expect((await send('PATCH', [{ id: 1, data: {} }])).status).toBe(200);
      });

      test('creates every item, responding with the created records', async () => {
        app = await server({ bulkCreate: enabled });

        const { status, body } = await send('POST', [full, full]);

        expect(status).toBe(201);
        expect(body).toEqual([postResponse, postResponse]);
        expect(service.bulkCreate).toHaveBeenCalledWith([full, full]);
      });

      test('updates and replaces every item by its id', async () => {
        app = await server({ bulkUpdate: enabled });

        const patched = await send('PATCH', [
          { id: 1, data: { title: 'One' } },
          { id: 2, data: { views: 3 } }
        ]);
        const replaced = await send('PUT', [{ id: 1, data: full }]);

        expect(patched.body).toEqual([postResponse, postResponse]);
        expect(service.bulkUpdate).toHaveBeenCalledWith([
          { id: 1, data: { title: 'One' } },
          { id: 2, data: { views: 3 } }
        ]);
        expect(replaced.body).toEqual([postResponse]);
        expect(service.bulkReplace).toHaveBeenCalledWith([
          { id: 1, data: full }
        ]);
      });

      test('deletes every item by its id', async () => {
        app = await server({ bulkDelete: enabled });

        const { status, body } = await send('DELETE', [1, 2, 3]);

        expect(status).toBe(200);
        expect(body).toEqual([postResponse, postResponse, postResponse]);
        expect(service.bulkDelete).toHaveBeenCalledWith([1, 2, 3]);
      });

      test('validates every item of the request', async () => {
        app = await server({
          ...all
        });

        expect((await send('POST', [full, { title: 'Title' }])).status).toBe(
          400
        );
        expect(
          (await send('PUT', [{ id: 1, data: { title: 'Title' } }])).status
        ).toBe(400);
        expect(
          (await send('PATCH', [{ id: 1, data: { unknown: 1 } }])).status
        ).toBe(400);
        expect((await send('PATCH', [{ data: { title: 'x' } }])).status).toBe(
          400
        );
        expect((await send('DELETE', [1, 1])).status).toBe(400);
        expect(service.bulkCreate).not.toHaveBeenCalled();
        expect(service.bulkUpdate).not.toHaveBeenCalled();
        expect(service.bulkReplace).not.toHaveBeenCalled();
        expect(service.bulkDelete).not.toHaveBeenCalled();
      });

      test('rejects an empty request and one over the maximum items', async () => {
        (common as any).configOverrides.RESOURCE_BULK_MAX_ITEMS = 2;
        app = await server({
          bulkCreate: enabled,
          bulkDelete: { exclude: false, maxItems: 3 }
        });

        expect((await send('POST', [])).status).toBe(400);
        expect((await send('POST', [full, full, full])).status).toBe(400);
        expect((await send('DELETE', [1, 2, 3])).status).toBe(200);
        expect((await send('DELETE', [1, 2, 3, 4])).status).toBe(400);
      });

      test('responds with the error of a failed bulk', async () => {
        app = await server({ bulkDelete: enabled });
        service.bulkDelete.mockRejectedValueOnce(
          new ResourceError(ErrorCode.ResourceNotFound, 'Post not found', {
            model: 'Post',
            id: 2
          })
        );

        const { status, body } = await send('DELETE', [1, 2]);

        expect(status).toBe(404);
        expect(body.code).toBe(ErrorCode.ResourceNotFound);
      });

      test('applies the route defaults and its own access', async () => {
        app = await server(
          {
            defaults: { public: true },
            bulkCreate: enabled,
            bulkDelete: { exclude: false, roles: ['Admin'] }
          },
          false,
          true
        );

        expect((await send('POST', [full])).status).toBe(201);
        expect((await send('DELETE', [1])).status).toBe(401);
      });

      test('inherits the config of the single route', async () => {
        app = await server(
          {
            delete: { public: true },
            bulkCreate: enabled,
            bulkDelete: enabled
          },
          false,
          true
        );

        expect((await send('DELETE', [1])).status).toBe(200);
        expect((await send('POST', [full])).status).toBe(401);
      });

      test('prefers its own access over the one of the single route', async () => {
        app = await server(
          {
            delete: { public: true },
            bulkDelete: { exclude: false, roles: ['Admin'] }
          },
          false,
          true
        );

        expect((await send('DELETE', [1])).status).toBe(401);
      });

      test('excludes a bulk route whose single route is excluded', async () => {
        (common as any).configOverrides.RESOURCE_BULK_CREATE_ENABLED = true;
        app = await server({ create: { exclude: true } });

        expect((await send('POST', [full])).status).toBe(404);
      });

      test('configures the bulk replace route apart from the bulk update one', async () => {
        app = await server(
          {
            bulkUpdate: { exclude: false, public: true, maxItems: 3 },
            bulkReplace: { maxItems: 1 }
          },
          false,
          true
        );
        const items = [
          { id: 1, data: full },
          { id: 2, data: full }
        ];

        expect((await send('PATCH', items)).status).toBe(200);
        expect((await send('PUT', items)).status).toBe(400);
        expect((await send('PUT', [items[0]])).status).toBe(200);
      });

      test('excludes the bulk replace route alone', async () => {
        app = await server({
          bulkUpdate: enabled,
          bulkReplace: { exclude: true }
        });

        expect((await send('PATCH', [{ id: 1, data: {} }])).status).toBe(200);
        // PUT reaches PUT /:id, whose id fails validation
        expect((await send('PUT', [{ id: 1, data: full }])).status).toBe(400);
        expect(service.bulkReplace).not.toHaveBeenCalled();
      });

      test('inherits the replace access on the bulk replace route', async () => {
        app = await server(
          {
            update: { public: true },
            replace: { roles: ['Admin'] },
            bulkUpdate: enabled
          },
          false,
          true
        );

        expect((await send('PATCH', [{ id: 1, data: {} }])).status).toBe(200);
        expect((await send('PUT', [{ id: 1, data: full }])).status).toBe(401);
      });

      test('responds with the records deleted by their own id', async () => {
        app = await server({ bulkDelete: enabled });
        service.bulkDelete.mockResolvedValueOnce([postResponse]);

        const { body } = await send('DELETE', [1, 2]);

        expect(body).toEqual([postResponse]);
      });

      test('responds with the count of the items when the config returns no records', async () => {
        (common as any).configOverrides.RESOURCE_BULK_RETURN_RECORDS = false;
        app = await server(all);
        service.bulkDelete.mockResolvedValueOnce([postResponse]);

        const created = await send('POST', [full, full]);
        const patched = await send('PATCH', [{ id: 1, data: {} }]);
        const replaced = await send('PUT', [{ id: 1, data: full }]);
        // The ids an earlier cascade removed count as deleted
        const deleted = await send('DELETE', [1, 2]);

        expect(created).toEqual({
          status: 201,
          body: { success: true, count: 2 }
        });
        expect(patched.body).toEqual({ success: true, count: 1 });
        expect(replaced.body).toEqual({ success: true, count: 1 });
        expect(deleted.body).toEqual({ success: true, count: 2 });
      });

      test('prefers the returnRecords option of a bulk route over the config', async () => {
        (common as any).configOverrides.RESOURCE_BULK_RETURN_RECORDS = false;
        app = await server({
          bulkCreate: { exclude: false, returnRecords: true },
          bulkDelete: enabled
        });

        expect((await send('POST', [full])).body).toEqual([postResponse]);
        expect((await send('DELETE', [1])).body).toEqual({
          success: true,
          count: 1
        });
      });

      test('excludes the bulk routes the route defaults exclude', async () => {
        (common as any).configOverrides.RESOURCE_BULK_CREATE_ENABLED = true;
        app = await server({ defaults: { exclude: true } });

        expect((await send('POST', [full])).status).toBe(404);
      });

      test('documents the bulk operations', async () => {
        app = await server(all, true);
        const document = (app as any).swagger();

        const bulk = document.paths['/posts/bulk'];
        expect(Object.keys(bulk).sort()).toEqual([
          'delete',
          'patch',
          'post',
          'put'
        ]);
        expect(
          bulk.delete.requestBody.content['application/json']
        ).toBeDefined();
        // Every bulk route responds with the records of its single route
        const single =
          document.paths['/posts'].post.responses['201'].content[
            'application/json'
          ].schema;
        const responses = [
          bulk.post.responses['201'],
          bulk.patch.responses['200'],
          bulk.put.responses['200'],
          bulk.delete.responses['200']
        ];
        for (const response of responses) {
          const schema = response.content['application/json'].schema;
          expect(schema.type).toBe('array');
          expect(schema.items).toEqual(single);
        }
      });

      test('documents the count response of a route returning no records', async () => {
        app = await server(
          { ...all, bulkUpdate: { exclude: false, returnRecords: false } },
          true
        );
        const document = (app as any).swagger();

        const bulk = document.paths['/posts/bulk'];
        // The count response is a shared model, referenced from the components
        const schema = (response: any) => {
          const { $ref, ...inline } =
            response.content['application/json'].schema;
          return $ref
            ? document.components.schemas[$ref.split('/').pop()]
            : inline;
        };
        expect(schema(bulk.post.responses['201']).type).toBe('array');
        for (const response of [
          bulk.patch.responses['200'],
          bulk.put.responses['200']
        ]) {
          expect(schema(response).type).toBe('object');
          expect(Object.keys(schema(response).properties)).toEqual([
            'success',
            'count'
          ]);
        }
      });
    });

    describe('bot checks', () => {
      const status = async (
        url: string,
        payload: any,
        headers: Record<string, string> = {}
      ) =>
        (await app!.inject({ method: 'POST', url, payload, headers }))
          .statusCode;

      test('verifies the Turnstile token of a route enabling it', async () => {
        app = await server({ query: { turnstile: true } });

        expect(await status('/posts/query', {})).toBe(400);
        expect(
          await status('/posts/query', {}, { 'x-turnstile-token': 'token' })
        ).toBe(200);
        expect(await status('/posts/aggregate', { select: {} })).toBe(200);
      });

      test('verifies the Turnstile token of a route naming its action', async () => {
        app = await server({ query: { turnstileAction: 'search' } });

        expect(await status('/posts/query', {})).toBe(400);
      });

      test('applies the default Turnstile check, unless a route disables it', async () => {
        app = await server({
          defaults: { turnstile: true },
          aggregate: { turnstile: false }
        });

        expect(await status('/posts/query', {})).toBe(400);
        expect(await status('/posts/aggregate', { select: {} })).toBe(200);
      });

      test('documents the Turnstile header of an enabled route', async () => {
        (common as any).configOverrides.SECURITY_TURNSTILE_ENABLED = true;
        app = await server({ query: { turnstile: true } }, true);
        const document = (app as any).swagger();

        const query = document.paths['/posts/query'].post;
        const aggregate = document.paths['/posts/aggregate'].post;
        const header = (operation: any) =>
          (operation.parameters ?? []).find(
            (p: any) => p.in === 'header' && p.name === 'x-turnstile-token'
          );

        expect(header(query)?.required).toBe(true);
        expect(header(aggregate)).toBeUndefined();
      });
    });

    describe('GET /query', () => {
      beforeEach(async () => {
        app = await server({ query: { method: 'get-post' } });
      });

      test('passes the query parameters to the service as the query options', async () => {
        const { status, body } = await request(
          'GET',
          `/posts/query?${queryString({
            filter: { views: { _gte: 10 } },
            page: '2',
            size: '20',
            sort: '-publishedAt,id',
            cursor: 'abc',
            totalCount: 'false'
          })}`
        );

        expect(status).toBe(200);
        expect(body).toEqual(queryResponse);
        expect(service.query).toHaveBeenCalledWith({
          filter: { views: { _gte: 10 } },
          page: 2,
          size: 20,
          sort: '-publishedAt,id',
          cursor: 'abc',
          totalCount: false
        });
      });

      test('passes the same options as the equal POST request', async () => {
        const options = {
          filter: { title: { _contains: 'news' } },
          size: 5,
          sort: { views: 'desc' }
        };

        await request('POST', '/posts/query', options);
        await request('GET', `/posts/query?${queryString(options)}`);

        expect(service.query.mock.calls[1][0]).toEqual(
          service.query.mock.calls[0][0]
        );
      });

      test('accepts the sort as a JSON-encoded object', async () => {
        await request(
          'GET',
          `/posts/query?${queryString({ sort: { views: 'desc' } })}`
        );

        expect(service.query.mock.calls[0][0].sort).toEqual({ views: 'desc' });
      });

      test('rejects an unknown filter field', async () => {
        const { status, body } = await request(
          'GET',
          `/posts/query?${queryString({ filter: { views: 1, unknown: 2 } })}`
        );

        expect(status).toBe(400);
        expect(body).toMatchObject({
          code: ErrorCode.ValidationFailed,
          errors: [
            {
              field: 'filter.unknown',
              rule: 'additionalProperties',
              message: 'is not allowed',
              pointer: '#/querystring/filter/unknown'
            }
          ]
        });
        expect(service.query).not.toHaveBeenCalled();
      });

      test('rejects an unknown query parameter', async () => {
        const { status, body } = await request(
          'GET',
          `/posts/query?${queryString({ other: 'x' })}`
        );

        expect(status).toBe(400);
        expect(body.errors).toEqual([
          expect.objectContaining({ field: 'other', message: 'is not allowed' })
        ]);
        expect(service.query).not.toHaveBeenCalled();
      });

      test('reports an invalid sort and filter together', async () => {
        const { status, body } = await request(
          'GET',
          `/posts/query?${queryString({
            sort: { titel: 'asc' },
            filter: { _or: [{ views: 1 }, { bogus: 2 }] }
          })}`
        );

        expect(status).toBe(400);
        expect(body.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'sort.titel' }),
            expect.objectContaining({ field: 'filter._or.1.bogus' })
          ])
        );
        expect(body.errors).toHaveLength(2);
      });

      test('rejects a malformed JSON filter', async () => {
        const { status, body } = await request(
          'GET',
          '/posts/query?filter={views'
        );

        expect(status).toBe(400);
        expect(body).toMatchObject({
          code: ErrorCode.ResourceInvalidQueryParameter,
          detail: expect.stringContaining("'filter'")
        });
        expect(service.query).not.toHaveBeenCalled();
      });

      test('rejects a repeated filter', async () => {
        const { status } = await request(
          'GET',
          '/posts/query?filter={}&filter={}'
        );

        expect(status).toBe(400);
        expect(service.query).not.toHaveBeenCalled();
      });

      test('rejects a filter that fails validation', async () => {
        const { status } = await request('GET', '/posts/query?filter=[1]');

        expect(status).toBe(400);
        expect(service.query).not.toHaveBeenCalled();
      });

      test('rejects a page size outside of the allowed range', async () => {
        const { status } = await request('GET', '/posts/query?size=5000');

        expect(status).toBe(400);
      });
    });

    describe('GET /aggregate', () => {
      beforeEach(async () => {
        app = await server({ aggregate: { method: 'get' } });
      });

      test('passes the query parameters to the service as the aggregate options', async () => {
        const { status, body } = await request(
          'GET',
          `/posts/aggregate?${queryString({
            select: { views: { sum: true, avg: true } },
            filter: { title: 'news' },
            dateField: 'publishedAt',
            from: '2026-01-01T00:00:00.000Z',
            to: '2026-02-01T00:00:00.000Z',
            step: '2',
            safeIncrement: 'false'
          })}`
        );

        expect(status).toBe(200);
        expect(body).toEqual(aggregateResponse);
        expect(service.aggregate).toHaveBeenCalledWith({
          select: { views: { sum: true, avg: true } },
          filter: { title: 'news' },
          dateField: 'publishedAt',
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-02-01T00:00:00.000Z',
          step: 2,
          safeIncrement: false
        });
      });

      test('requires the selection', async () => {
        const { status } = await request('GET', '/posts/aggregate');

        expect(status).toBe(400);
        expect(service.aggregate).not.toHaveBeenCalled();
      });

      test('rejects a malformed JSON selection', async () => {
        const { status, body } = await request(
          'GET',
          '/posts/aggregate?select=views'
        );

        expect(status).toBe(400);
        expect(body).toMatchObject({
          code: ErrorCode.ResourceInvalidQueryParameter,
          detail: expect.stringContaining("'select'")
        });
      });

      test('rejects a date field the model does not declare', async () => {
        const { status } = await request(
          'GET',
          `/posts/aggregate?${queryString({ select: {}, dateField: 'title' })}`
        );

        expect(status).toBe(400);
      });
    });

    describe('OpenAPI document', () => {
      const parameters = async (url: string): Promise<any[]> => {
        app = await server(
          { query: { method: 'get-post' }, aggregate: { method: 'get-post' } },
          true
        );
        const document = (app as any).swagger();
        return document.paths[url].get.parameters;
      };

      test('documents the JSON-encoded query parameters as content', async () => {
        const params = await parameters('/posts/query');
        const filter = params.find((p) => p.name === 'filter');

        expect(filter.in).toBe('query');
        expect(filter.content['application/json'].schema).toBeDefined();
        expect(filter.schema).toBeUndefined();
      });

      test('documents the plain query parameters with a schema', async () => {
        const params = await parameters('/posts/query');
        const names = params.map((p) => p.name);

        expect(names).toEqual(
          expect.arrayContaining([
            'filter',
            'sort',
            'page',
            'size',
            'cursor',
            'totalCount'
          ])
        );
        expect(params.find((p) => p.name === 'page').schema.type).toBe(
          'number'
        );
        expect(params.find((p) => p.name === 'sort').content).toBeUndefined();
      });

      test('documents the required aggregate selection as content', async () => {
        const params = await parameters('/posts/aggregate');
        const select = params.find((p) => p.name === 'select');

        expect(select.required).toBe(true);
        expect(select.content['application/json'].schema).toBeDefined();
      });

      test('keeps the POST operations next to the GET ones', async () => {
        app = await server({ query: { method: 'get-post' } }, true);
        const document = (app as any).swagger();

        expect(Object.keys(document.paths['/posts/query'])).toEqual(
          expect.arrayContaining(['get', 'post'])
        );
      });
    });
  });
});
