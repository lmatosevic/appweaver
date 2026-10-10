jest.mock('@appweaver/common', () => {
  const actual = jest.requireActual('@appweaver/common');
  const configOverrides: Record<string, unknown> = {};
  return {
    __esModule: true,
    ...actual,
    configOverrides,
    get config() {
      return { ...actual.config, ...configOverrides };
    }
  };
});

import Fastify, { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import * as common from '@appweaver/common';
import {
  ErrorCode,
  QueryMethod,
  ResourceRoutesConfig
} from '@appweaver/common';
import { context } from '../../context';
import { createModel } from '../../factory/create-model';
import { resourceRoutes } from '../../resource/resource-routes';
import { errorHandler, ProblemDetailsSchema } from '../../errors';
import { AuthError } from '../../security/auth-error';
import schemas from '../../server/schemas';
import { resetContext } from '../fixtures/context-fixture';
import { linkModels } from '../fixtures/model-fixture';

const queryResponse = {
  resultCount: 0,
  totalCount: 0,
  nextCursor: null,
  prevCursor: null,
  items: []
};

const aggregateResponse = { total: {}, items: [] };

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
    ajv: {
      customOptions: { removeAdditional: 'all', allowUnionTypes: true },
      plugins: [(ajv): any => ajv.addKeyword('example').addKeyword('x-consume')]
    }
  });

  context.server = app;

  // Rejecting every request that is authenticated tells the public routes apart
  app.decorate('authenticate', () => async () => {
    if (denyAuth) {
      throw new AuthError(ErrorCode.AuthUnauthorized, 'Unauthorized');
    }
  });
  app.decorate('recaptcha', async () => {});
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
  let service: { query: jest.Mock; aggregate: jest.Mock };

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
      aggregate: jest.fn().mockResolvedValue(aggregateResponse)
    };
    context.resource.services.set('Post', service as any);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    delete (common as any).configOverrides.RESOURCE_QUERY_METHOD;
    delete (common as any).configOverrides.RESOURCE_AGGREGATE_METHOD;
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

      test('strips the unknown filter fields and parameters', async () => {
        await request(
          'GET',
          `/posts/query?${queryString({
            filter: { views: 1, unknown: 2 },
            other: 'x'
          })}`
        );

        expect(service.query.mock.calls[0][0]).toEqual(
          expect.objectContaining({ filter: { views: 1 } })
        );
        expect(service.query.mock.calls[0][0]).not.toHaveProperty('other');
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
