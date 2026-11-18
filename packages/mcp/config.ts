import { Type } from '@sinclair/typebox';
import { AuthType, defineConfig } from '@appweaver/common';

export const mcpConfig = defineConfig('mcp', {
  /** Enable the MCP endpoint. Default: `true`. */
  ENABLED: Type.Boolean({ default: true }),
  /** Prefix of the MCP endpoint, under the API prefix. Default: `'/mcp'`. */
  ROUTE_PREFIX: Type.String({ default: '/mcp' }),
  /** The authentication strategies of the endpoint (`jwt`, `apiKey`, `basic`). Default: `['jwt', 'apiKey']`. */
  AUTH: Type.Array(Type.String(), {
    default: [AuthType.Jwt, AuthType.ApiKey]
  }),
  /** Allow the anonymous clients, which see only the `public` tools. Default: `false`. */
  ANONYMOUS_ENABLED: Type.Boolean({ default: false }),
  /** Expose the destructive tools: the `update` and `delete` resource actions and the tools marked `destructive`.
   * Default: `false`. */
  DESTRUCTIVE_ENABLED: Type.Boolean({ default: false }),
  /** The name of the server shown to the agents. Default: the `app.name` config. */
  SERVER_NAME: Type.Optional(Type.String()),
  /** Instructions for the agents using the server, i.e. what the application is for. */
  INSTRUCTIONS: Type.Optional(Type.String()),
  /** The maximum records a resource query tool returns, unless its resource sets its own. Default: `50`. */
  MAX_LIMIT: Type.Integer({ default: 50, minimum: 1 }),
  /** The maximum size of the result of a tool, i.e. `256KB`. Default: `'256KB'`. */
  MAX_RESULT_SIZE: Type.String({ default: '256KB' }),
  /** The origins of the browsers allowed to call the endpoint, `*` for any. A request without an `Origin` header,
   * i.e. of an agent, is always allowed. Default: `[]`. */
  ALLOWED_ORIGINS: Type.Array(Type.String(), { default: [] }),
  /** Log every tool call at the info level: the user, the tool, the duration and the outcome. Default: `true`. */
  LOG_CALLS: Type.Boolean({ default: true })
});
