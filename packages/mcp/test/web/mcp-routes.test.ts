import { Type } from '@sinclair/typebox';
import { configOverrides, createLogger } from '@appweaver/common';
import { resetContext } from '@appweaver/testing';
import { createMcpTool } from '../../tools/create-tool';
import { admin, post, startMcpApp, user, usePosts } from '../fixtures/mcp-app';

const logger = createLogger('mcp');

describe('mcp-routes', () => {
  let close: (() => Promise<void>) | undefined;

  const start = async (authUser?: object) => {
    const app = await startMcpApp(authUser);
    close = () => app.server.close();
    return app;
  };

  beforeEach(() => {
    resetContext();
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await close?.();
    close = undefined;
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  afterAll(() => {
    resetContext();
  });

  describe('registerMcpRoutes', () => {
    test('initializes a session of the latest or the requested protocol', async () => {
      configOverrides.MCP_INSTRUCTIONS = 'Manages the posts';
      configOverrides.MCP_SERVER_NAME = 'blog';
      const { client } = await start(user);

      await expect(
        client.request('initialize', { protocolVersion: '2025-06-18' })
      ).resolves.toMatchObject({
        protocolVersion: '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'blog' },
        instructions: 'Manages the posts'
      });
      await expect(
        client.request('initialize', { protocolVersion: '1999-01-01' })
      ).resolves.toMatchObject({ protocolVersion: '2025-11-25' });
      await expect(client.request('ping')).resolves.toEqual({});
    });

    test('lists and calls the tools of the resources and the custom tools', async () => {
      const service = usePosts({ actions: ['find', 'query'] });
      createMcpTool({
        name: 'echo',
        description: 'Echoes a text',
        input: Type.Object({ text: Type.String() }),
        readOnly: true,
        handler: ({ text }) => text
      });
      const { client } = await start(user);

      const tools = await client.listTools();
      const found = await client.callTool('post_find', { id: '1' });

      expect(tools.map((tool) => tool.name)).toEqual([
        'echo',
        'post_find',
        'post_query'
      ]);
      expect(service.find).toHaveBeenCalledWith(1);
      expect(found.structuredContent).toEqual({
        id: 1,
        title: 'Hello',
        views: 3,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString()
      });
      await expect(client.callTool('echo', { text: 'hi' })).resolves.toEqual({
        content: [{ type: 'text', text: 'hi' }]
      });
    });

    test('answers a notification with 202', async () => {
      const { server } = await start(user);

      const response = await server.inject({
        method: 'POST',
        url: '/mcp',
        headers: { authorization: `Bearer ${JSON.stringify(user)}` },
        payload: { jsonrpc: '2.0', method: 'notifications/initialized' }
      });

      expect(response.statusCode).toBe(202);
    });

    test('opens no stream and keeps no session', async () => {
      const { server } = await start(user);

      for (const method of ['GET', 'DELETE'] as const) {
        const response = await server.inject({ method, url: '/mcp' });
        expect(response.statusCode).toBe(405);
        expect(response.headers.allow).toBe('POST');
      }
    });

    test('refuses an anonymous client unless allowed, which sees the public tools', async () => {
      createMcpTool({ name: 'open', public: true, handler: () => 'ok' });
      createMcpTool({ name: 'closed', handler: () => 'no' });

      const { client } = await start();
      await expect(client.listTools()).rejects.toMatchObject({
        statusCode: 401
      });

      configOverrides.MCP_ANONYMOUS_ENABLED = true;
      await expect(client.listTools()).resolves.toEqual([
        expect.objectContaining({ name: 'open' })
      ]);
    });

    test('refuses a browser of an origin not allowed', async () => {
      const { server } = await start(user);
      const send = (origin: string) =>
        server.inject({
          method: 'POST',
          url: '/mcp',
          headers: {
            origin,
            authorization: `Bearer ${JSON.stringify(user)}`
          },
          payload: { jsonrpc: '2.0', id: 1, method: 'ping' }
        });

      const denied = await send('https://evil.example');
      configOverrides.MCP_ALLOWED_ORIGINS = ['https://app.example'];
      const allowed = await send('https://app.example');
      configOverrides.MCP_ALLOWED_ORIGINS = ['*'];
      const any = await send('https://other.example');

      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ code: 'MCP_ORIGIN_DENIED' });
      expect(allowed.statusCode).toBe(200);
      expect(any.statusCode).toBe(200);
    });

    test('registers nothing when disabled', async () => {
      configOverrides.MCP_ENABLED = false;
      const { client } = await start(admin);

      await expect(client.request('ping')).rejects.toMatchObject({
        statusCode: 404
      });
    });

    test('serves another path, i.e. under the API prefix', async () => {
      configOverrides.MCP_ROUTE_PREFIX = '/api/mcp/';
      const { server } = await start(user);

      const response = await server.inject({
        method: 'POST',
        url: '/api/mcp',
        headers: { authorization: `Bearer ${JSON.stringify(user)}` },
        payload: { jsonrpc: '2.0', id: 1, method: 'ping' }
      });

      expect(response.json()).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
    });
  });
});
