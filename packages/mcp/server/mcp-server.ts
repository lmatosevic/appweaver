import { Value } from '@sinclair/typebox/value';
import {
  appConfig,
  AuthUser,
  createLogger,
  ErrorCode,
  isAppweaverError,
  McpError,
  RealtimeAccess,
  textToBytes
} from '@appweaver/common';
import { hasPermissions, hasRoles } from '@appweaver/data';
import { mcpConfig } from '../config';
import { mcpTools } from '../tools/create-tool';
import { resourceTools } from '../tools/resource-tools';
import { McpTool } from '../types';
import { toJsonSchema } from '../utils/schema-util';
import { traceToolCall } from '../utils/telemetry';

const logger = createLogger('mcp');

/** The protocol versions the server speaks, the latest first. */
export const MCP_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];

/** A JSON-RPC message of a client. */
type JsonRpcMessage = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, any>;
};

/** A JSON-RPC response of the server. */
export type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

/** The result of a tool call. */
export type McpToolResult = {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

/** The warnings already logged, each logged once. */
const logged = new Set<string>();

/**
 * Handles a JSON-RPC message of an MCP client as the user of the request: `initialize`, `ping`, `tools/list` and
 * `tools/call`. A notification gets no response.
 *
 * @param {unknown} message - The message.
 * @param {AuthUser | null} user - The user of the request, null when anonymous.
 * @param {AbortSignal} [signal] - Aborted when the request ends.
 * @return {Promise<JsonRpcResponse | undefined>} The response, undefined for a notification.
 */
export async function handleMcpMessage(
  message: unknown,
  user: AuthUser | null,
  signal?: AbortSignal
): Promise<JsonRpcResponse | undefined> {
  const request = (message ?? {}) as JsonRpcMessage;
  const id = request.id ?? null;
  if (
    Array.isArray(message) ||
    request.jsonrpc !== '2.0' ||
    typeof request.method !== 'string'
  ) {
    return error(id, INVALID_REQUEST, 'Invalid JSON-RPC request');
  }
  if (request.id === undefined) {
    return undefined;
  }

  switch (request.method) {
    case 'initialize':
      return result(id, initialize(request.params?.protocolVersion));
    case 'ping':
      return result(id, {});
    case 'tools/list':
      return result(id, {
        tools: availableTools(user).map(describeTool)
      });
    case 'tools/call': {
      const name = request.params?.name;
      const tool = availableTools(user).find((entry) => entry.name === name);
      if (!tool) {
        return error(id, INVALID_PARAMS, `Unknown tool: ${String(name)}`);
      }
      return result(
        id,
        await callTool(tool, request.params?.arguments ?? {}, user, signal)
      );
    }
    default:
      return error(id, METHOD_NOT_FOUND, `Method not found: ${request.method}`);
  }
}

/**
 * Lists the tools a user may call: the custom tools and the resource actions their access allows, the destructive
 * ones only with `mcp.destructiveEnabled`.
 *
 * @param {AuthUser | null} user - The user, null when anonymous.
 * @return {McpTool[]} The tools.
 */
export function availableTools(user: AuthUser | null): McpTool[] {
  const tools = new Map<string, McpTool>();
  for (const tool of [...mcpTools(), ...resourceTools()]) {
    if (tools.has(tool.name)) {
      logOnce(`duplicate:${tool.name}`, () =>
        logger.warn({ tool: tool.name }, 'MCP tool name already taken')
      );
      continue;
    }
    if (tool.destructive && !mcpConfig.DESTRUCTIVE_ENABLED) {
      logOnce(tool.name, () =>
        logger.warn(
          { tool: tool.name },
          'Destructive MCP tool hidden, enable it with mcp.destructiveEnabled'
        )
      );
      continue;
    }
    if (hasAccess(user, tool.access)) {
      tools.set(tool.name, tool);
    }
  }
  return [...tools.values()];
}

/** @internal */
function initialize(requested: unknown) {
  const protocolVersion = MCP_PROTOCOL_VERSIONS.includes(requested as string)
    ? (requested as string)
    : MCP_PROTOCOL_VERSIONS[0];
  return {
    protocolVersion,
    capabilities: { tools: { listChanged: false } },
    serverInfo: {
      name: mcpConfig.SERVER_NAME ?? appConfig.NAME,
      version: appConfig.VERSION
    },
    ...(mcpConfig.INSTRUCTIONS ? { instructions: mcpConfig.INSTRUCTIONS } : {})
  };
}

function describeTool(tool: McpTool) {
  return {
    name: tool.name,
    ...(tool.title ? { title: tool.title } : {}),
    description: tool.description,
    inputSchema: toJsonSchema(tool.input),
    ...(tool.output ? { outputSchema: toJsonSchema(tool.output) } : {}),
    annotations: {
      readOnlyHint: tool.readOnly,
      destructiveHint: tool.destructive,
      openWorldHint: false
    }
  };
}

async function callTool(
  tool: McpTool,
  input: unknown,
  user: AuthUser | null,
  signal?: AbortSignal
): Promise<McpToolResult> {
  const started = performance.now();
  let outcome: McpToolResult;
  try {
    const args = Value.Convert(
      tool.input,
      Value.Default(tool.input, structuredClone(input))
    );
    const errors = [...Value.Errors(tool.input, args)]
      .slice(0, 10)
      .map((item) => `${item.path || '/'}: ${item.message}`);
    if (errors.length) {
      throw new McpError(
        ErrorCode.McpInputInvalid,
        `Invalid arguments of the tool '${tool.name}'`,
        { tool: tool.name, errors }
      );
    }
    const value = await traceToolCall(tool.name, () =>
      tool.call(args, { user, signal })
    );
    outcome = toResult(tool, value);
  } catch (e) {
    outcome = errorResult(tool, e);
  }
  if (mcpConfig.LOG_CALLS) {
    logger.info(
      {
        tool: tool.name,
        userId: user?.id ?? null,
        durationMs: Math.round(performance.now() - started),
        isError: outcome.isError ?? false
      },
      'MCP tool called'
    );
  }
  return outcome;
}

/** The result of a value a tool returned: a text, or a JSON value also given as structured content. */
function toResult(tool: McpTool, value: unknown): McpToolResult {
  const text =
    typeof value === 'string' ? value : (JSON.stringify(value) ?? 'null');
  const limit = textToBytes(mcpConfig.MAX_RESULT_SIZE);
  const size = Buffer.byteLength(text);
  if (size > limit) {
    throw new McpError(
      ErrorCode.McpResultTooLarge,
      `The result of the tool '${tool.name}' is too large (${size} bytes, at most ${limit}), ask for less`,
      { tool: tool.name, size, limit }
    );
  }
  const structured =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (JSON.parse(text) as Record<string, unknown>)
      : typeof value === 'string'
        ? undefined
        : { result: JSON.parse(text) };
  return {
    content: [{ type: 'text', text }],
    ...(structured ? { structuredContent: structured } : {})
  };
}

/** The result of a failed call: the code, the message and the details of an Appweaver error, any other one hidden. */
function errorResult(tool: McpTool, e: unknown): McpToolResult {
  if (!isAppweaverError(e)) {
    logger.error({ err: e, tool: tool.name }, 'MCP tool failed');
  }
  const body = isAppweaverError(e)
    ? { code: e.code, message: e.message, details: e.details }
    : { code: ErrorCode.InternalError, message: 'The tool failed' };
  return {
    content: [{ type: 'text', text: JSON.stringify(body) }],
    isError: true
  };
}

function hasAccess(user: AuthUser | null, access: RealtimeAccess): boolean {
  if (access.public) {
    return true;
  }
  return (
    !!user &&
    hasRoles(user, access.roles) &&
    hasPermissions(user, access.permissions)
  );
}

function logOnce(key: string, log: () => void): void {
  if (!logged.has(key)) {
    logged.add(key);
    log();
  }
}

function result(id: string | number | null, value: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result: value };
}

function error(
  id: string | number | null,
  code: number,
  message: string
): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}
