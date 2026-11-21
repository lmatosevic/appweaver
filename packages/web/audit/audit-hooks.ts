import { FastifyRequest } from 'fastify';
import {
  AuditCategory,
  AuditEntry,
  currentTraceId,
  isPlainObject,
  ResourceId,
  RouteAuditConfig,
  RouteConfig,
  uuidv7
} from '@appweaver/common';
import {
  currentApiKey,
  currentAuthType,
  currentAuthUser,
  inject,
  RequestScope
} from '@appweaver/core';
import { AuditService } from '@appweaver/data';
import { healthCheckConfig } from '../health/health-check-config';
import { accountConfig, securityConfig } from '../security/security-config';
import { serverConfig, swaggerConfig } from '../server/server-config';
import { templatePreviewConfig } from '../template/template-preview-config';
import { Server } from '../types/server';
import { auditRequestConfig } from './audit-config';

/** The category, the action and the model of the entry of a request. */
export type AuditTarget = {
  category: AuditCategory;
  action?: string;
  model?: string;
};

/** A request in flight whose entry is recorded once it responds. */
type AuditedRequest = {
  auditId: string;
  /** The scope of the request, whose source and action a route may change, i.e. to the tool of an MCP call */
  scope: RequestScope;
  start: number;
  startedAt: Date;
  target: AuditTarget;
  caller?: Pick<AuditEntry, 'userId' | 'authType' | 'apiKeyId' | 'traceId'>;
  error?: unknown;
};

/** The resource routes reading the records, the others writing them. */
const READ_ROUTES = new Set([
  'find',
  'query',
  'aggregate',
  'export',
  'fileVersions',
  'seriesQuery'
]);

const READ_METHODS = new Set(['GET', 'HEAD']);

const requests = new WeakMap<object, AuditedRequest>();

/**
 * Creates the request scope of a request, the one its changes are recorded in. With the audit log enabled, it starts
 * the entry of the request, or marks the request as excluded (`audit.excludePaths`, `audit: false` of its route), so
 * neither the request nor its changes are recorded.
 *
 * @param {FastifyRequest} request - The request.
 * @return {RequestScope} The scope of the request.
 */
export function auditRequestScope(request: FastifyRequest): RequestScope {
  const scope: RequestScope = {
    source: 'http',
    requestId: String(request.id),
    ip: request.ip,
    userAgent: request.headers['user-agent']
  };
  const audit = auditService();
  if (!audit) {
    return scope;
  }
  const target = auditTarget(request);
  if (!target) {
    return { ...scope, excluded: true };
  }
  const auditId = uuidv7();
  audit.open(auditId);
  Object.assign(scope, { auditId, action: target.action });
  requests.set(request, {
    auditId,
    scope,
    start: performance.now(),
    startedAt: new Date(),
    target
  });
  return scope;
}

/**
 * Records the requests of a server in the audit log once they respond, with the user who made them, their status and
 * error code, and the changes they made. Registered before any plugin, so a request every plugin rejects (i.e. a
 * failed authentication) is recorded too.
 *
 * @param {Server} server - The server.
 */
export function registerAuditHooks(server: Server): void {
  if (!auditService()) {
    return;
  }

  // The user is authenticated by now, and the hook runs in the auth context
  server.addHook('onSend', (request, _reply, payload, done) => {
    const audited = requests.get(request);
    if (audited) {
      audited.caller = {
        userId: currentAuthUser()?.id ?? null,
        authType: currentAuthType() ?? null,
        apiKeyId: currentApiKey<{ id?: ResourceId }>()?.id ?? null,
        traceId: currentTraceId()
      };
    }
    done(null, payload);
  });

  server.addHook('onError', (request, _reply, error, done) => {
    const audited = requests.get(request);
    if (audited) {
      audited.error = error;
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
 * Tells what the entry of a request is: a resource route its model and its action (`read` for the reading ones), an
 * authentication route the `auth` category, any other route the category of its method, all overridden by the `audit`
 * option of the route.
 *
 * @param {FastifyRequest} request - The request.
 * @return {AuditTarget | undefined} The target, or undefined for a request left out of the audit log.
 */
export function auditTarget(request: FastifyRequest): AuditTarget | undefined {
  if (request.method === 'OPTIONS' || isExcludedPath(request.url)) {
    return undefined;
  }
  const config = (request.routeOptions?.config ?? {}) as RouteConfig & {
    resourceRouteName?: string;
    resourceModelName?: string;
  };
  if (config.audit === false) {
    return undefined;
  }
  const custom: RouteAuditConfig = isPlainObject(config.audit)
    ? config.audit
    : {};

  if (config.resourceRouteName) {
    return {
      category:
        custom.category ??
        (READ_ROUTES.has(config.resourceRouteName) ? 'read' : 'write'),
      action: custom.action ?? config.resourceRouteName,
      model: config.resourceModelName
    };
  }
  const route = request.routeOptions?.url;
  const authAction = route ? authRouteAction(route) : undefined;
  if (authAction) {
    return {
      category: custom.category ?? 'auth',
      action: custom.action ?? authAction
    };
  }
  return {
    category:
      custom.category ?? (READ_METHODS.has(request.method) ? 'read' : 'write'),
    action: custom.action
  };
}

/** Records the entry of a request with its changes, once. */
function endRequest(request: FastifyRequest, statusCode?: number): void {
  const audited = requests.get(request);
  if (!audited) {
    return;
  }
  requests.delete(request);
  const audit = inject(AuditService, false);
  if (!audit) {
    return;
  }

  const { auditId, scope, target, caller, error } = audited;
  const recorded =
    audit.isCategoryEnabled(target.category) &&
    !audit.isExcluded(target.model, target.action);
  if (!recorded) {
    audit.close(auditId);
    return;
  }

  const params = request.params as { id?: ResourceId } | undefined;
  const errorCode = (error as { code?: unknown } | undefined)?.code;
  audit.close(auditId, {
    ...target,
    action: scope.action,
    source: scope.source,
    method: request.method,
    route: request.routeOptions?.url,
    path: request.url.split('?')[0],
    query:
      isPlainObject(request.query) && Object.keys(request.query).length > 0
        ? request.query
        : undefined,
    body:
      auditRequestConfig.REQUEST_BODY &&
      target.category !== 'read' &&
      (isPlainObject(request.body) || Array.isArray(request.body))
        ? request.body
        : undefined,
    status: statusCode,
    errorCode: typeof errorCode === 'string' ? errorCode : undefined,
    duration: Math.round((performance.now() - audited.start) * 1000) / 1000,
    userId: caller?.userId ?? null,
    authType: caller?.authType ?? null,
    apiKeyId: caller?.apiKeyId ?? null,
    traceId: caller?.traceId,
    ip: request.ip,
    userAgent: request.headers['user-agent'],
    requestId: String(request.id),
    resourceId: target.model ? params?.id : undefined,
    createdAt: audited.startedAt
  });
}

/** The audit service, when the audit log is enabled. */
function auditService(): AuditService | undefined {
  const audit = inject(AuditService, false);
  return audit?.enabled ? audit : undefined;
}

/** The action of an authentication or account route, named after its path (`auth.login`, `auth.account.2fa.verify`). */
function authRouteAction(route: string): string | undefined {
  const prefixes: [string, string][] = [
    [accountConfig.ROUTE_PREFIX, 'auth.account'],
    [securityConfig.ROUTE_PREFIX, 'auth']
  ];
  prefixes.sort(([a], [b]) => b.length - a.length);
  for (const [prefix, name] of prefixes) {
    const base = prefix.replace(/\/+$/, '');
    if (base && (route === base || route.startsWith(`${base}/`))) {
      const segments = route
        .slice(base.length)
        .split('/')
        .filter((segment) => segment && !/^[:*]/.test(segment));
      return [name, ...segments].join('.');
    }
  }
  return undefined;
}

/** Whether a URL is left out: the configured paths, and the health check, Swagger, static and template routes. */
function isExcludedPath(url: string): boolean {
  const path = url.split('?')[0];
  const exact = new Set<string>();
  const prefixes: string[] = [];
  const addPrefix = (prefix: string) => {
    const base = prefix.replace(/\/+$/, '');
    // A route at the root would leave every request out
    if (base) {
      exact.add(base);
      prefixes.push(`${base}/`);
    }
  };

  for (const excluded of auditRequestConfig.EXCLUDE_PATHS) {
    if (excluded.endsWith('*')) {
      prefixes.push(excluded.slice(0, -1));
    } else {
      exact.add(excluded);
    }
  }
  if (healthCheckConfig.ENABLED) {
    addPrefix(healthCheckConfig.ROUTE_PREFIX);
  }
  if (swaggerConfig.ENABLED) {
    addPrefix(swaggerConfig.PATH);
  }
  if (serverConfig.STATIC_ENABLED) {
    addPrefix(serverConfig.STATIC_ROUTE_PREFIX);
  }
  if (templatePreviewConfig.ENABLED) {
    addPrefix(templatePreviewConfig.ROUTE_PREFIX);
  }
  return exact.has(path) || prefixes.some((prefix) => path.startsWith(prefix));
}
