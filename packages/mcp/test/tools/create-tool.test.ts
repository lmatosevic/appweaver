import { Type } from '@sinclair/typebox';
import { ConfigurationError } from '@appweaver/common';
import { resetContext } from '@appweaver/testing';
import { createMcpTool, findMcpTool, mcpTools } from '../../tools/create-tool';

describe('create-tool', () => {
  beforeEach(() => {
    resetContext();
  });

  afterAll(() => {
    resetContext();
  });

  describe('createMcpTool', () => {
    test('registers a tool with its defaults', () => {
      const tool = createMcpTool({ name: 'ping', handler: () => 'pong' });

      expect(findMcpTool('ping')).toBe(tool);
      expect(mcpTools()).toEqual([tool]);
      expect(tool).toMatchObject({
        description: 'ping',
        readOnly: false,
        destructive: false,
        access: {}
      });
    });

    test('takes the shape of an AI tool', async () => {
      const parameters = Type.Object({ city: Type.String() });
      const tool = createMcpTool({
        name: 'getWeather',
        description: 'The weather of a city',
        parameters,
        execute: ({ city }) => `Sunny in ${city}`,
        public: true
      });

      expect(tool.input).toBe(parameters);
      expect(tool.access).toEqual({ public: true });
      expect(tool.call({ city: 'Split' }, { user: null })).toBe(
        'Sunny in Split'
      );
    });

    test('rejects an invalid name, a taken name and a tool without a handler', () => {
      createMcpTool({ name: 'taken', handler: () => 1 });

      expect(() => createMcpTool({ name: 'taken', handler: () => 1 })).toThrow(
        "MCP tool 'taken' is already defined"
      );
      expect(() =>
        createMcpTool({ name: 'has space', handler: () => 1 })
      ).toThrow(ConfigurationError);
      expect(() => createMcpTool({ name: 'empty' })).toThrow(
        ConfigurationError
      );
    });

    test('caches a read-only tool only', () => {
      expect(
        createMcpTool({
          name: 'cached',
          readOnly: true,
          cache: 1000,
          cacheRelations: ['Post'],
          handler: () => 1
        }).cache
      ).toEqual({ ttl: 1000, relations: ['Post'] });
      expect(
        createMcpTool({
          name: 'defaultTtl',
          readOnly: true,
          cache: true,
          handler: () => 1
        }).cache
      ).toEqual({ ttl: undefined, relations: undefined });
      expect(() =>
        createMcpTool({ name: 'writes', cache: true, handler: () => 1 })
      ).toThrow("MCP tool 'writes' caches its results, so must be readOnly");
    });
  });
});
