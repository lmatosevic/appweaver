import { AsyncResource } from 'node:async_hooks';
import Fastify from 'fastify';
import { fastifyRequestContext } from '@fastify/request-context';
import {
  AuthType,
  configOverrides,
  Database,
  ErrorCode,
  ResourceError
} from '@appweaver/common';
import {
  define,
  inject,
  runInAuthContext,
  runInRequestScope,
  setAuthContext,
  setRequestScope
} from '@appweaver/core';
import { AuditService, createModel } from '@appweaver/data';
import {
  createDatabaseStub,
  DatabaseStub,
  linkModels,
  resetContext
} from '@appweaver/testing';
import { auditRequestScope, registerAuditHooks } from '../../audit/audit-hooks';
import { Server } from '../../types/server';

describe('audit-hooks', () => {
  let db: DatabaseStub;
  let server: Server;

  const user = { id: 42, email: 'user@test.com', roles: [] };

  /** A server recording its requests the way `createServer` does. */
  const createServer = async (): Promise<Server> => {
    server = Fastify();
    registerAuditHooks(server);
    server.register(fastifyRequestContext, {
      createAsyncResource: (request) =>
        runInRequestScope(auditRequestScope(request), () =>
          runInAuthContext(() => new AsyncResource('test-request'))
        )
    });
    server.get(
      '/api/posts/:id',
      {
        config: { resourceRouteName: 'find', resourceModelName: 'Post' } as any
      },
      async () => ({ id: 1 })
    );
    server.patch(
      '/api/posts/:id',
      {
        config: {
          resourceRouteName: 'update',
          resourceModelName: 'Post'
        } as any
      },
      async (request) => {
        setAuthContext({ authUser: user, authType: AuthType.Jwt });
        inject(AuditService).recordChange(
          'Post',
          'update',
          { id: 1, title: 'First' },
          { id: 1, title: (request.body as any).title }
        );
        return { id: 1 };
      }
    );
    server.post(
      '/api/posts',
      {
        config: {
          resourceRouteName: 'create',
          resourceModelName: 'Post'
        } as any
      },
      async () => {
        inject(AuditService).recordChange('Post', 'create', undefined, {
          id: 9,
          title: 'New'
        });
        return { id: 9 };
      }
    );
    server.post('/auth/login', async () => {
      throw new ResourceError(ErrorCode.ResourceNotFound, 'Unknown user', {
        model: 'User',
        id: 1
      });
    });
    server.post('/auth/account/2fa/verify', async () => ({}));
    server.post('/api/reports/:id', async (request) => request.body);
    server.post('/api/skip', { config: { audit: false } }, async () => {
      inject(AuditService).recordChange('Post', 'create', undefined, {
        id: 3,
        title: 'Skipped'
      });
      return {};
    });
    server.post(
      '/api/invoices/send',
      { config: { audit: { category: 'custom', action: 'invoice.send' } } },
      async () => ({})
    );
    server.post('/mcp', async () => {
      setRequestScope({ source: 'mcp', action: 'mcp.post_create' });
      return {};
    });
    server.get('/health/ready', async () => ({ ready: true }));
    server.get('/api/metrics', async () => ({}));
    server.setErrorHandler((error, _request, reply) =>
      reply.status(error instanceof ResourceError ? 404 : 500).send({})
    );
    await server.ready();
    return server;
  };

  /** The rows of a model written so far. */
  const written = async (model: 'AuditLog' | 'AuditChange') => {
    await inject(AuditService).flush();
    return db.queries
      .filter((query) => query.model === model && query.method === 'createMany')
      .flatMap((query) => query.args.data);
  };

  beforeEach(() => {
    resetContext();
    configOverrides.AUDIT_ENABLED = true;
    db = createDatabaseStub(['AuditLog', 'AuditChange', 'Post']);
    define(db.database, Database as any);
    define(AuditService);
    createModel({ name: 'Post', scalars: { title: { type: 'string' } } });
    linkModels();
  });

  afterEach(async () => {
    await server?.close();
    await inject(AuditService, false)?.onDestroy();
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  afterAll(() => {
    resetContext();
  });

  test('records a write request with the user, the client and its changes', async () => {
    await createServer();

    const response = await server.inject({
      method: 'PATCH',
      url: '/api/posts/1?draft=true',
      headers: { 'user-agent': 'jest' },
      payload: { title: 'Second' }
    });

    expect(response.statusCode).toBe(200);
    const [log] = await written('AuditLog');
    expect(log).toMatchObject({
      category: 'write',
      source: 'http',
      action: 'update',
      model: 'Post',
      resourceId: '1',
      method: 'PATCH',
      route: '/api/posts/:id',
      path: '/api/posts/1',
      query: { draft: 'true' },
      status: 200,
      userId: '42',
      authType: 'jwt',
      ip: '127.0.0.1',
      userAgent: 'jest'
    });
    expect(log.duration).toBeGreaterThanOrEqual(0);
    expect(log).not.toHaveProperty('body');
    expect(await written('AuditChange')).toEqual([
      expect.objectContaining({
        auditLogId: log.id,
        diff: { title: { from: 'First', to: 'Second' } }
      })
    ]);
  });

  test('names the record a create made', async () => {
    await createServer();

    await server.inject({ method: 'POST', url: '/api/posts', payload: {} });

    expect((await written('AuditLog'))[0]).toMatchObject({
      action: 'create',
      resourceId: '9'
    });
  });

  test('leaves the reading requests out unless audit.read is enabled', async () => {
    await createServer();
    await server.inject({ url: '/api/posts/1' });
    await server.inject({ url: '/api/metrics' });
    expect(await written('AuditLog')).toHaveLength(0);

    configOverrides.AUDIT_READ_ENABLED = true;
    await server.inject({ url: '/api/posts/1' });
    await server.inject({ url: '/api/metrics' });

    expect(await written('AuditLog')).toEqual([
      expect.objectContaining({ category: 'read', action: 'find' }),
      expect.objectContaining({ category: 'read', method: 'GET' })
    ]);
  });

  test('records the failed authentication requests as anonymous', async () => {
    await createServer();

    await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user@test.com', password: 'Secret1!' }
    });
    await server.inject({ method: 'POST', url: '/auth/account/2fa/verify' });

    const logs = await written('AuditLog');
    expect(logs[0]).toMatchObject({
      category: 'auth',
      action: 'auth.login',
      status: 404,
      errorCode: ErrorCode.ResourceNotFound
    });
    expect(logs[0]).not.toHaveProperty('userId');
    expect(logs[1]).toMatchObject({ action: 'auth.account.2fa.verify' });
  });

  test('records the redacted bodies with audit.requestBody', async () => {
    configOverrides.AUDIT_REQUEST_BODY = true;
    await createServer();

    await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user@test.com', password: 'Secret1!' }
    });

    expect((await written('AuditLog'))[0].body).toEqual({
      email: 'user@test.com',
      password: '[Redacted]'
    });
  });

  test('takes the category and the action from the audit option of the route', async () => {
    await createServer();

    await server.inject({ method: 'POST', url: '/api/invoices/send' });

    expect((await written('AuditLog'))[0]).toMatchObject({
      category: 'custom',
      action: 'invoice.send'
    });
  });

  test('takes the source and the action a route sets', async () => {
    await createServer();

    await server.inject({ method: 'POST', url: '/mcp' });

    expect((await written('AuditLog'))[0]).toMatchObject({
      category: 'write',
      source: 'mcp',
      action: 'mcp.post_create'
    });
  });

  test('leaves out a route with audit: false, with its changes', async () => {
    await createServer();

    await server.inject({ method: 'POST', url: '/api/skip' });

    expect(await written('AuditLog')).toHaveLength(0);
  });

  test('leaves out the excluded paths, the health routes and the preflight requests', async () => {
    configOverrides.AUDIT_EXCLUDE_PATHS = [
      '/api/reports/*',
      '/api/invoices/send'
    ];
    await createServer();

    await server.inject({ method: 'POST', url: '/api/reports/1' });
    await server.inject({ method: 'POST', url: '/api/invoices/send' });
    await server.inject({ url: '/health/ready' });
    await server.inject({ method: 'OPTIONS', url: '/api/posts/1' });

    expect(await written('AuditLog')).toHaveLength(0);
  });

  test('leaves out the Swagger, static and template routes, never every route of a root prefix', async () => {
    configOverrides.AUDIT_READ_ENABLED = true;
    configOverrides.TEMPLATE_PREVIEW_ENABLED = true;
    configOverrides.SERVER_STATIC_ENABLED = true;
    configOverrides.SERVER_STATIC_ROUTE_PREFIX = '/';
    await createServer();

    await server.inject({ url: '/swagger/json' });
    await server.inject({ url: '/templates/welcome' });
    await server.inject({ url: '/api/metrics' });

    expect(await written('AuditLog')).toEqual([
      expect.objectContaining({ path: '/api/metrics' })
    ]);
  });

  test('records the changes of a request without an entry on their own', async () => {
    configOverrides.AUDIT_WRITE_ENABLED = false;
    await createServer();

    await server.inject({
      method: 'PATCH',
      url: '/api/posts/1',
      payload: { title: 'Second' }
    });

    const [log] = await written('AuditLog');
    expect(log).toMatchObject({
      category: 'change',
      source: 'http',
      action: 'update'
    });
    expect(await written('AuditChange')).toHaveLength(1);
  });

  test('leaves out the excluded actions', async () => {
    configOverrides.AUDIT_EXCLUDE_ACTIONS = ['auth.login'];
    await createServer();

    await server.inject({ method: 'POST', url: '/auth/login' });

    expect(await written('AuditLog')).toHaveLength(0);
  });

  test('records nothing with the audit log disabled', async () => {
    configOverrides.AUDIT_ENABLED = false;
    await createServer();

    await server.inject({
      method: 'PATCH',
      url: '/api/posts/1',
      payload: { title: 'Second' }
    });

    expect(await written('AuditLog')).toHaveLength(0);
  });
});
