import { Type } from '@sinclair/typebox';
import {
  AiError,
  configOverrides,
  createLogger,
  ErrorCode
} from '@appweaver/common';
import {
  recordTelemetry,
  resetContext,
  TelemetryRecorder
} from '@appweaver/testing';
import { availableTools, handleMcpMessage } from '../../server/mcp-server';
import { createMcpTool } from '../../tools/create-tool';
import { admin, user, usePosts } from '../fixtures/mcp-app';

const logger = createLogger('mcp');

/** Sends a request, returning its result or its error. */
const send = (method: string, params?: object, as: object | null = user) =>
  handleMcpMessage({ jsonrpc: '2.0', id: 7, method, params }, as as never);

const call = async (name: string, args: object = {}, as: object = user) =>
  ((await send('tools/call', { name, arguments: args }, as)) as any).result;

describe('mcp-server', () => {
  beforeEach(() => {
    resetContext();
    jest.spyOn(logger, 'info').mockImplementation();
    jest.spyOn(logger, 'warn').mockImplementation();
    jest.spyOn(logger, 'error').mockImplementation();
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

  describe('handleMcpMessage', () => {
    test('rejects an invalid request, a batch and an unknown method', async () => {
      await expect(handleMcpMessage({ id: 1 }, null)).resolves.toMatchObject({
        id: 1,
        error: { code: -32600 }
      });
      await expect(handleMcpMessage([], null)).resolves.toMatchObject({
        id: null,
        error: { code: -32600 }
      });
      await expect(handleMcpMessage(null, null)).resolves.toMatchObject({
        error: { code: -32600 }
      });
      await expect(send('resources/list')).resolves.toEqual({
        jsonrpc: '2.0',
        id: 7,
        error: { code: -32601, message: 'Method not found: resources/list' }
      });
    });

    test('answers no notification', async () => {
      await expect(
        handleMcpMessage({ jsonrpc: '2.0', method: 'ping' }, null)
      ).resolves.toBeUndefined();
    });

    test('describes the tools with their schemas and annotations', async () => {
      createMcpTool({
        name: 'lookup',
        title: 'Look up',
        description: 'Looks a word up',
        input: Type.Object({ word: Type.String() }),
        output: Type.Object({ meaning: Type.String() }),
        readOnly: true,
        handler: () => ({ meaning: 'x' })
      });

      const { result } = (await send('tools/list')) as any;

      expect(result.tools).toEqual([
        {
          name: 'lookup',
          title: 'Look up',
          description: 'Looks a word up',
          inputSchema: {
            type: 'object',
            properties: { word: { type: 'string' } },
            required: ['word']
          },
          outputSchema: {
            type: 'object',
            properties: { meaning: { type: 'string' } },
            required: ['meaning']
          },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false
          }
        }
      ]);
    });

    test('rejects an unknown tool, or one the user may not call', async () => {
      createMcpTool({ name: 'admin', roles: ['admin'], handler: () => 1 });

      await expect(
        send('tools/call', { name: 'admin', arguments: {} })
      ).resolves.toMatchObject({ error: { code: -32602 } });
      await expect(call('admin', {}, admin)).resolves.toMatchObject({
        structuredContent: { result: 1 }
      });
    });

    test('returns a text, an object and any other value', async () => {
      createMcpTool({ name: 'text', handler: () => 'plain' });
      createMcpTool({ name: 'object', handler: () => ({ a: 1 }) });
      createMcpTool({ name: 'list', handler: () => [1, 2] });
      createMcpTool({ name: 'nothing', handler: () => undefined });

      await expect(call('text')).resolves.toEqual({
        content: [{ type: 'text', text: 'plain' }]
      });
      await expect(call('object')).resolves.toEqual({
        content: [{ type: 'text', text: '{"a":1}' }],
        structuredContent: { a: 1 }
      });
      await expect(call('list')).resolves.toEqual({
        content: [{ type: 'text', text: '[1,2]' }],
        structuredContent: { result: [1, 2] }
      });
      await expect(call('nothing')).resolves.toEqual({
        content: [{ type: 'text', text: 'null' }],
        structuredContent: { result: null }
      });
    });

    test('validates the arguments, filling in their defaults', async () => {
      const handler = jest.fn(() => 'ok');
      createMcpTool({
        name: 'count',
        input: Type.Object({
          n: Type.Integer(),
          step: Type.Integer({ default: 1 })
        }),
        handler
      });

      const invalid = await call('count', { n: 'many' });
      await call('count', { n: '3' });

      expect(invalid.isError).toBe(true);
      expect(JSON.parse(invalid.content[0].text)).toMatchObject({
        code: ErrorCode.McpInputInvalid,
        details: { tool: 'count', errors: [expect.stringContaining('/n')] }
      });
      expect(handler).toHaveBeenCalledWith(
        { n: 3, step: 1 },
        expect.objectContaining({ user })
      );
    });

    test('returns the error of a failed call, hiding an unexpected one', async () => {
      createMcpTool({
        name: 'known',
        handler: () => {
          throw new AiError(ErrorCode.AiTimeout, 'Too slow', {
            model: 'm',
            endpoint: 'e'
          });
        }
      });
      createMcpTool({
        name: 'unknown',
        handler: () => {
          throw new Error('Database password is wrong');
        }
      });

      const known = await call('known');
      const unknown = await call('unknown');

      expect(known.isError).toBe(true);
      expect(JSON.parse(known.content[0].text)).toEqual({
        code: ErrorCode.AiTimeout,
        message: 'Too slow',
        details: { model: 'm', endpoint: 'e' }
      });
      expect(JSON.parse(unknown.content[0].text)).toEqual({
        code: ErrorCode.InternalError,
        message: 'The tool failed'
      });
      expect(logger.error).toHaveBeenCalled();
    });

    test('refuses a result over the size limit', async () => {
      configOverrides.MCP_MAX_RESULT_SIZE = '10B';
      createMcpTool({ name: 'big', handler: () => 'x'.repeat(20) });

      const result = await call('big');

      expect(JSON.parse(result.content[0].text)).toMatchObject({
        code: ErrorCode.McpResultTooLarge,
        details: { size: 20, limit: 10 }
      });
    });

    test('logs the calls unless disabled', async () => {
      createMcpTool({ name: 'quiet', handler: () => 'ok' });

      await call('quiet');
      configOverrides.MCP_LOG_CALLS = false;
      await call('quiet');

      expect(logger.info).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ tool: 'quiet', userId: 1, isError: false }),
        'MCP tool called'
      );
    });
  });

  describe('availableTools', () => {
    test('hides the destructive tools until they are enabled', () => {
      usePosts({ actions: ['find', 'create', 'update', 'delete'] });
      createMcpTool({ name: 'wipe', destructive: true, handler: () => 0 });
      const names = () => availableTools(user as never).map((t) => t.name);

      const hidden = names();
      configOverrides.MCP_DESTRUCTIVE_ENABLED = true;

      expect(hidden).toEqual(['post_find', 'post_create']);
      expect(names()).toEqual([
        'wipe',
        'post_find',
        'post_create',
        'post_update',
        'post_delete'
      ]);
      expect(logger.warn).toHaveBeenCalledWith(
        { tool: 'wipe' },
        expect.stringContaining('mcp.destructiveEnabled')
      );
    });

    test('keeps the first tool of a name', () => {
      usePosts({ actions: ['find'] });
      createMcpTool({ name: 'post_find', handler: () => 'custom' });

      const tools = availableTools(user);

      expect(tools).toHaveLength(1);
      expect(tools[0].call({}, { user: null })).toBe('custom');
    });
  });

  describe('telemetry', () => {
    let telemetry: TelemetryRecorder;

    beforeEach(() => {
      telemetry = recordTelemetry();
    });

    afterEach(async () => {
      await telemetry.stop();
    });

    test('traces the tool calls and measures them', async () => {
      createMcpTool({ name: 'traced', handler: () => 'ok' });
      createMcpTool({
        name: 'failing',
        handler: () => {
          throw new Error('boom');
        }
      });

      await call('traced');
      await call('failing');

      expect(telemetry.span('tools/call traced').attributes).toMatchObject({
        'mcp.method.name': 'tools/call',
        'gen_ai.tool.name': 'traced'
      });
      expect(
        telemetry.span('tools/call failing').attributes['error.type']
      ).toBe('Error');
      expect(
        await telemetry.metric('mcp.server.operation.duration')
      ).toBeDefined();
    });

    test('records nothing while the instrumentation is off', async () => {
      configOverrides.TELEMETRY_INSTRUMENTATIONS_MCP = false;
      createMcpTool({ name: 'untraced', handler: () => 'ok' });

      await call('untraced');

      expect(telemetry.spans()).toEqual([]);
    });
  });
});
