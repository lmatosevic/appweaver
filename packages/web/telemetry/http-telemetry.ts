import { FastifyRequest } from 'fastify';
import {
  DURATION_BUCKETS,
  extractTraceContext,
  failSpan,
  recordDuration,
  runInTraceContext,
  Span,
  SpanKind,
  SpanStatusCode,
  spanErrorType,
  startSpan,
  telemetryEnabled,
  telemetryHistogram,
  telemetryUpDownCounter,
  TraceContext
} from '@appweaver/common';
import { currentAuthUser } from '@appweaver/core';
import { healthCheckConfig } from '../health/health-check-config';
import { Server } from '../types/server';
import { httpTelemetryConfig } from './http-telemetry-config';

/** The span of a request in flight. */
type RequestTelemetry = {
  span: Span;
  context: TraceContext;
  start: number;
  method: string;
  error?: unknown;
};

const requests = new WeakMap<object, RequestTelemetry>();

const requestDuration = telemetryHistogram('http.server.request.duration', {
  description: 'Duration of the HTTP server requests.',
  unit: 's',
  advice: { explicitBucketBoundaries: DURATION_BUCKETS }
});

const activeRequests = telemetryUpDownCounter('http.server.active_requests', {
  description: 'Number of the HTTP server requests in flight.',
  unit: '{request}'
});

/**
 * Traces and measures the requests of a server: a server span per request, named after its method and route
 * (`GET /api/posts/:id`), continuing the trace of its `traceparent` header, and the duration and the number of the
 * requests in flight. Registered before any plugin, so the span covers the hooks of every one of them.
 *
 * @param {Server} server - The server to trace the requests of.
 */
export function registerHttpTelemetry(server: Server): void {
  if (!telemetryEnabled('http')) {
    return;
  }
  const ignored = pathMatcher();

  server.addHook('onRequest', (request, _reply, done) => {
    const path = request.url.split('?')[0];
    if (ignored(path)) {
      done();
      return;
    }
    const route = request.routeOptions?.url;
    const { span, context } = startSpan(
      route ? `${request.method} ${route}` : request.method,
      {
        kind: SpanKind.SERVER,
        parent: extractTraceContext(request.headers),
        attributes: {
          'http.request.method': request.method,
          'url.path': path,
          'url.scheme': request.protocol,
          'server.address': request.hostname,
          'client.address': request.ip,
          'network.protocol.version': request.raw.httpVersion,
          ...(route ? { 'http.route': route } : {}),
          ...(request.headers['user-agent']
            ? { 'user_agent.original': request.headers['user-agent'] }
            : {})
        }
      }
    );
    requests.set(request, {
      span,
      context,
      start: performance.now(),
      method: request.method
    });
    activeRequests().add(1, { 'http.request.method': request.method });
    done();
  });

  // The user is authenticated by now, and the hook runs in the auth context
  server.addHook('onSend', (request, _reply, payload, done) => {
    const user = requests.has(request) ? currentAuthUser() : undefined;
    if (user) {
      requests.get(request)!.span.setAttribute('user.id', String(user.id));
    }
    done(null, payload);
  });

  server.addHook('onError', (request, _reply, error, done) => {
    const telemetry = requests.get(request);
    if (telemetry) {
      telemetry.error = error;
    }
    done();
  });

  server.addHook('onResponse', (request, reply, done) => {
    endRequest(request, reply.statusCode);
    done();
  });

  // An aborted request may never respond
  server.addHook('onRequestAbort', (request, done) => {
    endRequest(request);
    done();
  });
}

/**
 * Returns the span of a request, i.e. to add attributes to it in a hook running outside of its trace context.
 *
 * @param {Object} [request] - The request.
 * @return {Span | undefined} The span, or `undefined` for a request that is not traced.
 */
export function requestSpan(request?: object): Span | undefined {
  return request ? requests.get(request)?.span : undefined;
}

/**
 * Runs a function in the trace context of a request, so the async resource created in it keeps the span of the
 * request active through its hooks and its handler.
 *
 * @param {FastifyRequest} request - The request.
 * @param {Function} fn - The function to run.
 * @return {Object} The value returned by the function.
 */
export function runInRequestTrace<T>(request: FastifyRequest, fn: () => T): T {
  const telemetry = requests.get(request);
  return telemetry ? runInTraceContext(telemetry.context, fn) : fn();
}

/** Ends the span of a request and records its duration, once. */
function endRequest(request: FastifyRequest, statusCode?: number): void {
  const telemetry = requests.get(request);
  if (!telemetry) {
    return;
  }
  requests.delete(request);
  const { span, start, method, error } = telemetry;
  const route = request.routeOptions?.url;
  // Only a server error fails the span of a server, a client error does not
  const failed = statusCode === undefined || statusCode >= 500;
  const failure = failed
    ? error
      ? spanErrorType(error)
      : String(statusCode ?? 'aborted')
    : undefined;

  if (statusCode !== undefined) {
    span.setAttribute('http.response.status_code', statusCode);
  }
  if (failed && error) {
    failSpan(span, error);
  } else if (failed) {
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.setAttribute('error.type', failure!);
  } else if (error) {
    span.setAttribute('appweaver.error.code', spanErrorType(error));
  }
  span.end();

  activeRequests().add(-1, { 'http.request.method': method });
  recordDuration(requestDuration(), start, {
    'http.request.method': method,
    'url.scheme': request.protocol,
    ...(route ? { 'http.route': route } : {}),
    ...(statusCode !== undefined
      ? { 'http.response.status_code': statusCode }
      : {}),
    ...(failure ? { 'error.type': failure } : {})
  });
}

/** Creates the check of the paths left out: the configured ones, and the health check routes. */
function pathMatcher(): (path: string) => boolean {
  const exact = new Set<string>();
  const prefixes: string[] = [];
  for (const path of httpTelemetryConfig.IGNORE_PATHS) {
    if (path.endsWith('*')) {
      prefixes.push(path.slice(0, -1));
    } else {
      exact.add(path);
    }
  }
  if (healthCheckConfig.ENABLED && !httpTelemetryConfig.HEALTH_CHECK) {
    const prefix = healthCheckConfig.ROUTE_PREFIX.replace(/\/+$/, '');
    exact.add(prefix);
    prefixes.push(`${prefix}/`);
  }
  return (path) =>
    exact.has(path) || prefixes.some((prefix) => path.startsWith(prefix));
}
