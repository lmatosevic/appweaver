import { Static, TSchema, Type } from '@sinclair/typebox';
import {
  ConfigurationError,
  createLogger,
  ErrorCode,
  RealtimeAccess
} from '@appweaver/common';
import { define, injectAll } from '@appweaver/core';
import { McpTool, McpToolContext } from '../types';

const logger = createLogger('mcp');

/** The key of the custom tools in the application context. */
export const MCP_TOOL = Symbol.for('appweaver.McpTool');

const NAME_PATTERN = /^[a-zA-Z0-9_.-]{1,64}$/;

/** A custom tool of the MCP server. */
export type McpToolConfig<I extends TSchema = TSchema> = RealtimeAccess & {
  /** Letters, digits, `_`, `-` and `.`, i.e. `refundOrder` */
  name: string;
  /** Read by the agents to decide when to call the tool */
  description?: string;
  title?: string;
  /** The schema of the arguments, validated before the handler runs. Default: no arguments */
  input?: I;
  /** The schema of the arguments, as an AI tool of `createAiTool` names it */
  parameters?: I;
  /** The schema of the structured result */
  output?: TSchema;
  /** Changes nothing. Default: `false` */
  readOnly?: boolean;
  /** May change or delete existing data, exposed only with `mcp.destructiveEnabled`. Default: `false` */
  destructive?: boolean;
  /** Cache the results of a read-only tool per user and arguments with `mcp.cache.enabled`: `true` for
   * `mcp.cache.ttl`, or the time-to-live in milliseconds. Default: `false` */
  cache?: boolean | number;
  /** The models whose changes evict the cached results, which otherwise only expire */
  cacheRelations?: string[];
  /** Runs the tool as the user of the request */
  handler?: (args: Static<I>, context: McpToolContext) => unknown;
  /** Runs the tool, as an AI tool of `createAiTool` names it */
  execute?: (args: Static<I>, context: any) => unknown;
};

/**
 * Creates a custom tool of the MCP server, an AI tool of `createAiTool` included (`parameters` and `execute`). The
 * tool is called as the user of the request, by the users its `public`, `roles` and `permissions` allow, which see
 * only the tools they may call.
 *
 * @example
 * createMcpTool({
 *   name: 'refundOrder',
 *   description: 'Refunds a paid order',
 *   input: Type.Object({ orderId: Type.Integer() }),
 *   roles: ['support'],
 *   destructive: true,
 *   handler: ({ orderId }) => refunds.refund(orderId)
 * });
 *
 * @param {McpToolConfig} config - The tool.
 * @return {McpTool} The tool.
 * @throws {ConfigurationError} `CONFIGURATION_INVALID` for an invalid or taken name, a tool without a handler, or a
 * cached tool not read-only.
 */
export function createMcpTool<I extends TSchema = TSchema>(
  config: McpToolConfig<I>
): McpTool {
  const { name, public: isPublic, roles, permissions } = config;
  const handler = config.handler ?? config.execute;
  if (!NAME_PATTERN.test(name) || !handler) {
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      `Invalid MCP tool '${name}': a name of up to 64 letters, digits, '_', '-' and '.', and a handler`
    );
  }
  if (config.cache && !config.readOnly) {
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      `MCP tool '${name}' caches its results, so must be readOnly`
    );
  }
  if (findMcpTool(name)) {
    throw new ConfigurationError(
      ErrorCode.ConfigurationInvalid,
      `MCP tool '${name}' is already defined`
    );
  }
  const tool: McpTool = {
    name,
    title: config.title,
    description: config.description ?? name,
    input: config.input ?? config.parameters ?? Type.Object({}),
    output: config.output,
    readOnly: config.readOnly ?? false,
    destructive: config.destructive ?? false,
    access: { public: isPublic, roles, permissions },
    call: handler,
    cache: config.cache
      ? {
          ttl: typeof config.cache === 'number' ? config.cache : undefined,
          relations: config.cacheRelations
        }
      : undefined
  };
  // Wrapped in an object, since the context would instantiate a function
  define({ tool }, MCP_TOOL, 'append');
  logger.debug({ tool: name }, 'Created MCP tool');
  return tool;
}

/** Lists the custom tools of {@link createMcpTool}. */
export function mcpTools(): McpTool[] {
  return injectAll<{ tool: McpTool }>(MCP_TOOL).map((entry) => entry.tool);
}

/** Finds a custom tool by its name. */
export function findMcpTool(name: string): McpTool | undefined {
  return mcpTools().find((tool) => tool.name === name);
}
