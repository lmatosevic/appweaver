import Fastify, { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import {
  configOverrides,
  ErrorCode,
  Queue,
  ResourceError,
  ResourceRoutesConfig,
  TimeSeries
} from '@appweaver/common';
import { CacheService, define, TimeSeriesService } from '@appweaver/core';
import { MemoryQueue, MemoryTimeSeries } from '@appweaver/core/drivers';
import { context } from '@appweaver/core/internal';
import { createModel, createPolicy } from '@appweaver/data';
import { linkModels, resetContext } from '@appweaver/testing';
import { resourceRoutes } from '../../resource/resource-routes';
import { errorHandler } from '../../errors/error-handler';
import { ProblemDetailsSchema } from '../../errors';
import schemas from '../../server/schemas';
import { requestValidation } from '../../server/request-validation';
import { referencedSerializer } from '../../server/response-serialization';

const at = (minutes: number) =>
  new Date(Date.UTC(2026, 0, 1) + minutes * 60_000).toISOString();

async function server(
  routesConfig: Omit<ResourceRoutesConfig, 'modelName' | 'path'> = {},
  swagger: boolean = false
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ...requestValidation() });
  app.setSerializerCompiler(
    referencedSerializer()(undefined as any, undefined as any) as any
  );
  define({ instance: app }, 'HttpServer', 'override');
  app.decorate('authenticate', () => async () => {});
  app.decorate('recaptcha', async () => {});
  app.decorate('turnstile', async () => {});
  app.setErrorHandler(errorHandler);
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
  app.register(resourceRoutes('Sensor', routesConfig), { prefix: '/sensors' });
  await app.ready();
  return app;
}

describe('series-routes', () => {
  let app: FastifyInstance | undefined;
  let service: { find: jest.Mock; query: jest.Mock };
  let store: MemoryTimeSeries;

  const request = async (
    method: 'GET' | 'POST',
    url: string,
    payload?: any
  ): Promise<{ status: number; body: any }> => {
    const response = await app!.inject({ method, url, payload });
    return { status: response.statusCode, body: response.json() };
  };

  const sensor = (id: number) => ({ id, name: `Sensor ${id}` });

  beforeEach(() => {
    resetContext();
    createModel({
      name: 'Sensor',
      scalars: { name: { type: 'string' } },
      series: {
        temperature: { type: 'float', minimum: -50, maximum: 150 },
        errors: { type: 'int' },
        online: { type: 'boolean' }
      }
    });
    linkModels();

    service = {
      find: jest.fn(async (id: number) => {
        if (id > 10) {
          throw new ResourceError(
            ErrorCode.ResourceNotFound,
            'Sensor not found',
            {
              model: 'Sensor',
              id
            }
          );
        }
        return sensor(id);
      }),
      query: jest.fn(async ({ filter }: any) => {
        const ids: number[] = filter.id?._in ??
          filter._and?.[1]?.id?._in ?? [1, 2, 3];
        return { items: ids.filter((id) => id <= 10).map(sensor) };
      })
    };
    context.resource.services.set('Sensor', service as any);

    store = new MemoryTimeSeries();
    define(store, TimeSeries);
    define(TimeSeriesService);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    for (const key of Object.keys(configOverrides)) {
      if (key.startsWith('TIMESERIES_')) {
        delete configOverrides[key];
      }
    }
  });

  afterAll(() => {
    resetContext();
  });

  test('writes the points of a resource and queries them back', async () => {
    app = await server();

    const write = await request('POST', '/sensors/1/series', {
      points: [
        { time: at(0), temperature: 20.5, online: true },
        { time: Date.parse(at(1)), temperature: 21, errors: 2 }
      ]
    });
    const query = await request(
      'GET',
      '/sensors/1/series?fields=temperature,errors'
    );

    expect(write).toEqual({ status: 200, body: { count: 2, queued: false } });
    expect(service.find).toHaveBeenCalledWith(1);
    expect(query).toEqual({
      status: 200,
      body: {
        items: [
          { time: at(0), temperature: 20.5, errors: null },
          { time: at(1), temperature: 21, errors: 2 }
        ]
      }
    });
  });

  test('aggregates the points of a bucket', async () => {
    app = await server();
    await request('POST', '/sensors/1/series', {
      points: [
        { time: at(0), temperature: 10, online: true },
        { time: at(30), temperature: 20, online: false },
        { time: at(90), temperature: 40, online: true }
      ]
    });

    const avg = await request(
      'GET',
      '/sensors/1/series?bucket=1h&fields=temperature,online'
    );
    const last = await request(
      'GET',
      `/sensors/1/series?bucket=1h&aggregate=last&order=desc&limit=1&from=${at(0)}`
    );

    expect(avg.body.items).toEqual([
      { time: at(0), temperature: 15, online: 0.5 },
      { time: at(60), temperature: 40, online: 1 }
    ]);
    expect(last.body.items).toEqual([
      { time: at(60), temperature: 40, errors: null, online: true }
    ]);
  });

  test.each([
    [{ points: [{ temperature: 200 }] }, 400],
    [{ points: [{ errors: 1.5 }] }, 400],
    [{ points: [] }, 400],
    [{ points: [{ time: 'later', errors: 1 }] }, 400]
  ])('rejects the write %j', async (payload, status) => {
    app = await server();

    await expect(
      request('POST', '/sensors/1/series', payload)
    ).resolves.toMatchObject({
      status
    });
  });

  test('rejects an invalid query', async () => {
    app = await server();

    const bucket = await request('GET', '/sensors/1/series?bucket=soon');
    const range = await request(
      'GET',
      `/sensors/1/series?from=${at(5)}&to=${at(1)}`
    );
    const field = await request('GET', '/sensors/1/series?fields=humidity');

    expect(bucket.status).toBe(400);
    expect(range.body.code).toBe(ErrorCode.TimeSeriesInvalidRange);
    expect(field.body.code).toBe(ErrorCode.TimeSeriesInvalidField);
  });

  test('responds with not found for a resource it cannot read', async () => {
    app = await server();

    const response = await request('POST', '/sensors/99/series', {
      points: [{ errors: 1 }]
    });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe(ErrorCode.ResourceNotFound);
  });

  test('checks the series policy of each action', async () => {
    createPolicy({
      modelName: 'Sensor',
      series: {
        canWrite: (_user, resource: any) => resource.id !== 2,
        canRead: () => true,
        canDelete: () => false
      }
    });
    app = await server();

    const allowed = await request('POST', '/sensors/1/series', {
      points: [{ errors: 1 }]
    });
    const denied = await request('POST', '/sensors/2/series', {
      points: [{ errors: 1 }]
    });
    const deleted = await request('POST', '/sensors/1/delete-series', {});

    expect(allowed.status).toBe(200);
    expect(denied).toMatchObject({
      status: 403,
      body: { code: ErrorCode.TimeSeriesForbidden }
    });
    expect(deleted.status).toBe(403);
  });

  test('queues the points of a model queueing them, unless written directly', async () => {
    configOverrides.TIMESERIES_INGEST = 'queue';
    const queue = new MemoryQueue();
    define(queue, Queue);
    app = await server();

    const queued = await request('POST', '/sensors/1/series', {
      points: [{ errors: 1 }]
    });
    const direct = await request('POST', '/sensors/1/series?ingest=direct', {
      points: [{ time: at(0), errors: 2 }]
    });

    expect(queued).toEqual({ status: 202, body: { count: 1, queued: true } });
    expect(direct).toEqual({ status: 200, body: { count: 1, queued: false } });
    await queue.closeAll();
  });

  test('ignores the direct ingest when the route does not allow it', async () => {
    configOverrides.TIMESERIES_INGEST = 'queue';
    const queue = new MemoryQueue();
    define(queue, Queue);
    app = await server({ seriesWrite: { allowDirect: false, maxPoints: 1 } });

    const response = await request('POST', '/sensors/1/series?ingest=direct', {
      points: [{ errors: 1 }]
    });
    const tooMany = await request('POST', '/sensors/1/series', {
      points: [{ errors: 1 }, { errors: 2 }]
    });

    expect(response.status).toBe(202);
    expect(tooMany.status).toBe(400);
    await queue.closeAll();
  });

  test('writes and queries the points of many resources', async () => {
    app = await server();

    const write = await request('POST', '/sensors/series', {
      points: [
        { resourceId: 1, time: at(0), errors: 1 },
        { resourceId: 2, time: at(0), errors: 2 },
        { resourceId: 2, time: at(1), errors: 3 }
      ]
    });
    const byIds = await request('POST', '/sensors/series/query', {
      ids: [2, 1],
      fields: ['errors'],
      aggregate: 'sum'
    });
    const byFilter = await request('POST', '/sensors/series/query', {
      filter: { name: { _starts: 'Sensor' } },
      ids: [1],
      fields: ['errors']
    });

    expect(write.body).toEqual({ count: 3, queued: false });
    expect(service.query).toHaveBeenCalledWith(
      expect.objectContaining({ filter: { id: { _in: [1, 2] } } })
    );
    expect(byIds.body.items).toEqual([
      { resourceId: 1, time: at(0), errors: 1 },
      { resourceId: 2, time: at(0), errors: 5 }
    ]);
    expect(byFilter.body.items).toEqual([
      { resourceId: 1, time: at(0), errors: 1 }
    ]);
  });

  test('rejects a write of many resources with an unknown one', async () => {
    app = await server();

    const response = await request('POST', '/sensors/series', {
      points: [
        { resourceId: 1, errors: 1 },
        { resourceId: 50, errors: 1 }
      ]
    });

    expect(response).toMatchObject({
      status: 404,
      body: { code: ErrorCode.ResourceNotFound }
    });
  });

  test('rejects a query of more resources than allowed', async () => {
    configOverrides.TIMESERIES_MAX_RESOURCES_PER_QUERY = 2;
    app = await server();

    const byFilter = await request('POST', '/sensors/series/query', {
      filter: {}
    });
    const write = await request('POST', '/sensors/series', {
      points: [1, 2, 3].map((resourceId) => ({ resourceId, errors: 1 }))
    });

    expect(byFilter.body.code).toBe(ErrorCode.TimeSeriesTooManyResources);
    expect(write.body.code).toBe(ErrorCode.TimeSeriesTooManyResources);
  });

  test('deletes the points of a time range', async () => {
    app = await server();
    await request('POST', '/sensors/1/series', {
      points: [
        { time: at(0), errors: 1 },
        { time: at(1), errors: 2 }
      ]
    });

    const range = await request('POST', '/sensors/1/delete-series', {
      from: at(1)
    });
    const all = await request('POST', '/sensors/1/delete-series', {});

    expect(range.body).toEqual({ count: 1 });
    expect(all.body).toEqual({ count: 1 });
  });

  test('keeps the access check of a resource for the cache TTL', async () => {
    configOverrides.TIMESERIES_ACCESS_CACHE_TTL = 1000;
    const cached = new Map<string, unknown>();
    define(
      {
        getCachedValue: async (key: string) => cached.get(key) ?? null,
        addToCache: async (key: string, value: unknown) =>
          cached.set(key, value)
      },
      CacheService
    );
    app = await server();

    await request('POST', '/sensors/1/series', { points: [{ errors: 1 }] });
    await request('POST', '/sensors/1/series', { points: [{ errors: 2 }] });

    expect(service.find).toHaveBeenCalledTimes(1);
  });

  test('leaves out the excluded routes', async () => {
    app = await server({
      seriesWrite: { exclude: true },
      seriesQuery: { exclude: true },
      seriesDelete: { exclude: true }
    });

    const write = await request('POST', '/sensors/1/series', {
      points: [{ errors: 1 }]
    });
    const remove = await request('POST', '/sensors/1/delete-series', {});

    expect(write.status).toBe(404);
    expect(remove.status).toBe(404);
  });

  test('registers no series route with the time series disabled', async () => {
    context.definitions.splice(
      context.definitions.findIndex((def) => def.name === 'TimeSeriesService'),
      1
    );
    app = await server();

    const response = await request('POST', '/sensors/1/series', {
      points: [{ errors: 1 }]
    });

    expect(response.status).toBe(404);
  });

  test('documents the series routes', async () => {
    app = await server({}, true);

    const spec: any = app.swagger();

    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        '/sensors/{id}/series',
        '/sensors/series',
        '/sensors/series/query',
        '/sensors/{id}/delete-series'
      ])
    );
    expect(spec.paths['/sensors/{id}/series'].post.responses).toHaveProperty(
      '202'
    );
  });
});
