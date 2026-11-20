import { TSchema } from '@sinclair/typebox';
import { AuthUser, RealtimeAccess } from '@appweaver/common';

/** What the handler of a tool receives besides its arguments. */
export type McpToolContext = {
  /** The user of the request, null when anonymous */
  user: AuthUser | null;
  /** Aborted when the request ends */
  signal?: AbortSignal;
};

/** A tool of the MCP server: a custom one of `createMcpTool`, or an action of a resource. */
export type McpTool = {
  name: string;
  description: string;
  /** The schema the arguments are validated with, published as plain JSON Schema */
  input: TSchema;
  /** Whether the tool changes nothing */
  readOnly: boolean;
  /** Whether the tool may change or delete existing data, exposed only with `mcp.destructiveEnabled` */
  destructive: boolean;
  access: RealtimeAccess;
  call: (args: any, context: McpToolContext) => unknown;
  title?: string;
  /** The schema of the structured result */
  output?: TSchema;
  /** Caches the results of a read-only tool with `mcp.cache.enabled` */
  cache?: McpToolCache;
};

/** How the results of a read-only tool are cached, per user and arguments. */
export type McpToolCache = {
  /** Time-to-live in milliseconds. Default: `mcp.cache.ttl` */
  ttl?: number;
  /** The model the tool reads, its results evicted when it or a model it includes changes */
  modelName?: string;
  /** The models whose changes evict the results */
  relations?: string[];
};
