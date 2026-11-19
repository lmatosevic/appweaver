import { Type } from '@sinclair/typebox';
import {
  Cache,
  configOverrides,
  createLogger,
  Memory
} from '@appweaver/common';
import { CacheService, define } from '@appweaver/core';
import { InMemory, MemoryCache } from '@appweaver/core/drivers';
import { resetContext } from '@appweaver/testing';
import { handleMcpMessage } from '../../server/mcp-server';
import { createMcpTool } from '../../tools/create-tool';
import { admin, user, usePosts } from '../fixtures/mcp-app';

const logger = createLogger('mcp');

const call = async (name: string, args: object = {}, as: object = user) =>
  (
    (await handleMcpMessage(
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args }
      },
      as as never
    )) as any
  ).result;

describe('tool-cache', () => {
  let info: jest.SpyInstance;

  beforeEach(() => {
    resetContext();
    define(new InMemory(), Memory);
    define(new MemoryCache(), Cache);
    define(new CacheService(), CacheService);
    configOverrides.MCP_CACHE_ENABLED = true;
    info = jest.spyOn(logger, 'info').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of Object.keys(configOverrides)) {
      delete configOverrides[key];
    }
  });

  afterAll(() => {
    resetContext();
  });

  test('caches the results of a read action per user and arguments until its model changes', async () => {
    const service = usePosts({ actions: ['find', 'create'] });

    const first = await call('post_find', { id: 1 });
    await expect(call('post_find', { id: 1 })).resolves.toEqual(first);
    expect(service.find).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenLastCalledWith(
      expect.objectContaining({ tool: 'post_find', cached: true }),
      'MCP tool called'
    );

    await call('post_find', { id: 2 });
    await call('post_find', { id: 1 }, admin);
    expect(service.find).toHaveBeenCalledTimes(3);

    await new CacheService().invalidateCache('Post', 'create');
    await call('post_find', { id: 1 });
    expect(service.find).toHaveBeenCalledTimes(4);
  });

  test('caches a custom tool setting cache, never an error', async () => {
    let calls = 0;
    createMcpTool({
      name: 'counter',
      readOnly: true,
      cache: 60_000,
      input: Type.Object({ fail: Type.Optional(Type.Boolean()) }),
      handler: ({ fail }) => {
        calls++;
        if (fail) {
          throw new Error('failed');
        }
        return calls;
      }
    });
    jest.spyOn(logger, 'error').mockImplementation();

    await call('counter');
    await expect(call('counter')).resolves.toMatchObject({
      structuredContent: { result: 1 }
    });
    await call('counter', { fail: true });
    await expect(call('counter', { fail: true })).resolves.toMatchObject({
      isError: true
    });
    expect(calls).toBe(3);
  });

  test('caches nothing while disabled, or without the cache of the tool', async () => {
    const service = usePosts({ actions: ['find'], cache: false });
    createMcpTool({ name: 'plain', readOnly: true, handler: () => 1 });

    await call('post_find', { id: 1 });
    await call('post_find', { id: 1 });
    configOverrides.MCP_CACHE_ENABLED = false;
    const other = usePosts({ actions: ['find'] });
    await call('post_find', { id: 1 });
    await call('post_find', { id: 1 });

    expect(service.find).toHaveBeenCalledTimes(2);
    expect(other.find).toHaveBeenCalledTimes(2);
    expect(await new CacheService().cache.keys()).toEqual([]);
  });
});
