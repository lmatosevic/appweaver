import { AsyncResource } from 'node:async_hooks';
import fastify, { FastifyRequest } from 'fastify';
import { fastifyRequestContext } from '@fastify/request-context';
import { AuthError, AuthType, ErrorCode, ROUTE } from '@appweaver/common';
import { injectAll, runInAuthContext, setAuthContext } from '@appweaver/core';
import { context } from '@appweaver/core/internal';
import { createModel } from '@appweaver/data';
import { createMcpClient, linkModels } from '@appweaver/testing';
import { errorHandler, Server, stashErrorResponses } from '@appweaver/web';
import { ResourceMcpConfig, ResourceRoutesConfig } from '@appweaver/common';
import { registerMcpRoutes } from '../../web/mcp-routes';

export const user = { id: 1, email: 'user@test.com', enabled: true, roles: [] };
export const admin = {
  id: 2,
  email: 'admin@test.com',
  enabled: true,
  roles: [{ id: 1, name: 'admin', permissions: [] }]
};

/** A post as the resource service returns it, with a hidden field the projection leaves out. */
export const post = {
  id: 1,
  title: 'Hello',
  views: 3,
  secret: 'hidden',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z')
};

/** Defines the Post model, its routes exposing the given MCP config, and a stub of its service. */
export function usePosts(
  mcp?: ResourceMcpConfig,
  routes: Partial<ResourceRoutesConfig> = {}
) {
  createModel({
    name: 'Post',
    scalars: {
      title: { type: 'string' },
      views: { type: 'int' },
      status: {
        type: 'enum',
        values: ['draft', 'published'],
        default: 'draft'
      },
      secret: { type: 'string', hidden: true },
      tags: { type: 'string', array: true },
      meta: { type: 'json' }
    }
  } as any);
  linkModels();
  context.resource.routes.set('Post', {
    config: { modelName: 'Post', ...routes, mcp },
    basePath: 'posts',
    handler: () => {}
  });
  const service = {
    find: jest.fn(async () => post),
    query: jest.fn(async () => ({
      items: [post],
      resultCount: 1,
      totalCount: 1,
      nextCursor: null,
      prevCursor: null
    })),
    aggregate: jest.fn(async () => ({
      total: { views: { sum: 3 } },
      items: []
    })),
    create: jest.fn(async (data) => ({ ...post, ...data })),
    update: jest.fn(async (_, data) => ({ ...post, ...data })),
    delete: jest.fn(async () => post)
  };
  context.resource.services.set('Post', service as any);
  return service;
}

/**
 * Builds a server with the MCP routes, authenticating the `Authorization: Bearer <user JSON>` header, and a client of
 * it sending the given user. `setup` prepares the server before the routes are registered.
 */
export async function startMcpApp(
  authUser?: object,
  setup?: (server: Server) => void
) {
  registerMcpRoutes();
  const server = fastify() as unknown as Server;
  server.register(fastifyRequestContext, {
    createAsyncResource: () =>
      runInAuthContext(() => new AsyncResource('appweaver-request'))
  });
  server.setErrorHandler(errorHandler);
  server.addHook('onRoute', stashErrorResponses);
  server.decorate(
    'authenticate',
    () => (request: FastifyRequest, _: unknown, done: (e?: Error) => void) => {
      const header = request.headers.authorization ?? '';
      if (!header.startsWith('Bearer {')) {
        done(new AuthError(ErrorCode.AuthUnauthorized, 'Unauthorized'));
        return;
      }
      setAuthContext({
        authUser: JSON.parse(header.slice(7)),
        authType: AuthType.Jwt
      });
      done();
    }
  );
  setup?.(server);
  for (const route of injectAll<any>(ROUTE)) {
    server.register(route, {
      prefix: route.apiPrefix === false ? '' : '/api/'
    });
  }
  await server.ready();
  const client = createMcpClient((request) => server.inject(request), {
    headers: authUser
      ? { authorization: `Bearer ${JSON.stringify(authUser)}` }
      : {}
  });
  return { server, client };
}
