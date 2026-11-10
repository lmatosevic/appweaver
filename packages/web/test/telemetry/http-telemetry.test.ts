import { AsyncResource } from 'node:async_hooks';
import Fastify from 'fastify';
import { fastifyRequestContext } from '@fastify/request-context';
import {
  configOverrides,
  currentTraceId,
  ErrorCode,
  ResourceError,
  SpanKind,
  SpanStatusCode,
  withSpan
} from '@appweaver/common';
import { runInAuthContext, setAuthContext } from '@appweaver/core';
import { recordTelemetry, TelemetryRecorder } from '@appweaver/testing';
import {
  registerHttpTelemetry,
  requestSpan,
  runInRequestTrace
} from '../../telemetry/http-telemetry';
import { Server } from '../../types/server';

describe('http-telemetry', () => {
  let telemetry: TelemetryRecorder;
  let server: Server;

  /** A server tracing its requests the way `createServer` does. */
  const createServer = async (): Promise<Server> => {
    server = Fastify();
    registerHttpTelemetry(server);
    server.register(fastifyRequestContext, {
      createAsyncResource: (request) =>
        runInAuthContext(() =>
          runInRequestTrace(request, () => new AsyncResource('test-request'))
        )
    });
    server.get('/api/posts/:id', async (request) => {
      await Promise.resolve();
      return withSpan('load post', {}, () => ({
        traceId: currentTraceId(),
        spanTraceId: requestSpan(request)?.spanContext().traceId
      }));
    });
    server.post('/api/posts', async (request) => {
      setAuthContext({ authUser: { id: 42 } as any });
      return request.body;
    });
    server.get('/api/missing', async () => {
      throw new ResourceError(ErrorCode.ResourceNotFound, 'Post not found');
    });
    server.get('/api/broken', async () => {
      throw new TypeError('boom');
    });
    server.get('/api/unavailable', async (_request, reply) =>
      reply.status(503).send({})
    );
    server.get('/health/ready', async () => ({ ready: true }));
    server.get('/public/logo.svg', async () => 'svg');
    server.setErrorHandler((error, _request, reply) =>
      reply
        .status(error instanceof ResourceError ? 404 : 500)
        .send({ message: (error as Error).message })
    );
    await server.ready();
    return server;
  };

  beforeEach(() => {
    telemetry = recordTelemetry();
  });

  afterEach(async () => {
    await server?.close();
    await telemetry.stop();
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  test('records a server span named after the method and the route', async () => {
    await createServer();

    const response = await server.inject({
      url: '/api/posts/7?draft=true',
      headers: { 'user-agent': 'jest' }
    });

    const span = telemetry.span('GET /api/posts/:id');
    expect(span.kind).toBe(SpanKind.SERVER);
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
    expect(span.attributes).toMatchObject({
      'http.request.method': 'GET',
      'http.route': '/api/posts/:id',
      'url.path': '/api/posts/7',
      'url.scheme': 'http',
      'user_agent.original': 'jest',
      'http.response.status_code': 200
    });
    expect(span.attributes).not.toHaveProperty('user.id');
    // The span is active in the handler, and the parent of its spans
    const traceId = span.spanContext().traceId;
    expect(response.json()).toEqual({ traceId, spanTraceId: traceId });
    expect(telemetry.span('load post').parentSpanContext?.spanId).toBe(
      span.spanContext().spanId
    );
  });

  test('continues the trace of the traceparent header', async () => {
    await createServer();

    await server.inject({
      url: '/api/posts/7',
      headers: {
        traceparent: '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01'
      }
    });

    const span = telemetry.span('GET /api/posts/:id');
    expect(span.spanContext().traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(span.parentSpanContext?.spanId).toBe('b7ad6b7169203331');
  });

  test('adds the authenticated user of a request with a body', async () => {
    await createServer();

    await server.inject({
      method: 'POST',
      url: '/api/posts',
      payload: { title: 'Hello' }
    });

    expect(telemetry.span('POST /api/posts').attributes['user.id']).toBe('42');
  });

  test('names the span of an unknown route after the method alone', async () => {
    await createServer();

    await server.inject({ url: '/api/nothing' });

    const span = telemetry.span('GET');
    expect(span.attributes['http.response.status_code']).toBe(404);
    expect(span.attributes).not.toHaveProperty('http.route');
  });

  test('keeps the span of a client error unset, with its error code', async () => {
    await createServer();

    await server.inject({ url: '/api/missing' });

    const span = telemetry.span('GET /api/missing');
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
    expect(span.attributes).toMatchObject({
      'http.response.status_code': 404,
      'appweaver.error.code': ErrorCode.ResourceNotFound
    });
    expect(span.events).toHaveLength(0);
  });

  test('fails the span of a server error with its exception', async () => {
    await createServer();

    await server.inject({ url: '/api/broken' });

    const span = telemetry.span('GET /api/broken');
    expect(span.status).toEqual({
      code: SpanStatusCode.ERROR,
      message: 'boom'
    });
    expect(span.attributes['error.type']).toBe('TypeError');
    expect(span.events[0].name).toBe('exception');
  });

  test('fails the span of a server error status without an exception', async () => {
    await createServer();

    await server.inject({ url: '/api/unavailable' });

    const span = telemetry.span('GET /api/unavailable');
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.attributes['error.type']).toBe('503');
  });

  test('measures the duration and the requests in flight', async () => {
    await createServer();

    await server.inject({ url: '/api/posts/7' });
    await server.inject({ url: '/api/broken' });

    const duration = await telemetry.metric('http.server.request.duration');
    expect(duration?.dataPoints.map((point) => point.attributes)).toEqual(
      expect.arrayContaining([
        {
          'http.request.method': 'GET',
          'http.route': '/api/posts/:id',
          'http.response.status_code': 200,
          'url.scheme': 'http'
        },
        {
          'http.request.method': 'GET',
          'http.route': '/api/broken',
          'http.response.status_code': 500,
          'url.scheme': 'http',
          'error.type': 'TypeError'
        }
      ])
    );
    const active = await telemetry.metric('http.server.active_requests');
    expect(active?.dataPoints[0].value).toBe(0);
  });

  test('leaves the health check routes out by default', async () => {
    await createServer();

    await server.inject({ url: '/health/ready' });

    expect(telemetry.spans()).toHaveLength(0);
  });

  test('traces the health check routes when configured', async () => {
    configOverrides.TELEMETRY_HTTP_HEALTH_CHECK = true;
    await createServer();

    await server.inject({ url: '/health/ready' });

    expect(telemetry.span('GET /health/ready')).toBeDefined();
  });

  test('leaves the ignored paths out', async () => {
    configOverrides.TELEMETRY_HTTP_IGNORE_PATHS = ['/public/*', '/api/broken'];
    await createServer();

    await server.inject({ url: '/public/logo.svg' });
    await server.inject({ url: '/api/broken' });
    await server.inject({ url: '/api/posts/7' });

    expect(telemetry.spans().map((span) => span.name)).toEqual([
      'load post',
      'GET /api/posts/:id'
    ]);
  });

  test('ends the span of an aborted request, once', async () => {
    const hooks: Record<string, (...args: any[]) => void> = {};
    registerHttpTelemetry({
      addHook: (name: string, hook: (...args: any[]) => void) => {
        hooks[name] = hook;
      }
    } as unknown as Server);
    const request = {
      method: 'GET',
      url: '/api/slow',
      protocol: 'http',
      hostname: 'localhost',
      ip: '127.0.0.1',
      headers: {},
      raw: { httpVersion: '1.1' },
      routeOptions: { url: '/api/slow' }
    };
    const done = jest.fn();

    hooks.onRequest(request, {}, done);
    hooks.onRequestAbort(request, done);
    hooks.onResponse(request, { statusCode: 200 }, done);

    expect(done).toHaveBeenCalledTimes(3);
    expect(telemetry.spans()).toHaveLength(1);
    const span = telemetry.span('GET /api/slow');
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.attributes['error.type']).toBe('aborted');
    expect(span.attributes).not.toHaveProperty('http.response.status_code');
  });

  test('records nothing with the instrumentation off', async () => {
    configOverrides.TELEMETRY_INSTRUMENTATIONS_HTTP = false;
    await createServer();

    const response = await server.inject({ url: '/api/posts/7' });

    // Only the span of the handler, the root of its own trace
    expect(response.json().spanTraceId).toBeUndefined();
    expect(telemetry.spans().map((span) => span.name)).toEqual(['load post']);
    expect(telemetry.span('load post').parentSpanContext).toBeUndefined();
    expect(requestSpan(undefined)).toBeUndefined();
  });
});
