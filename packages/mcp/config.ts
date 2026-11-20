import { Type } from '@sinclair/typebox';
import { AuthType, defineConfig } from '@appweaver/common';

export const mcpConfig = defineConfig('mcp', {
  /** Enable the MCP endpoint. Default: `true`. */
  ENABLED: Type.Boolean({ default: true }),
  /** Path of the MCP endpoint, at the root like the auth and health routes (`'/api/mcp'` under the API). Default: `'/mcp'`. */
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

export const mcpCacheConfig = defineConfig('mcp.cache', {
  /** Cache the results of the read-only resource tools and of the custom tools setting `cache`, per user. Requires
   * `cache.enabled`. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** Time-to-live of a cached result in milliseconds, unless the tool sets its own. Default: `5000` (5 sec). */
  TTL: Type.Integer({ default: 5000, minimum: 1 })
});

export const mcpRateLimitConfig = defineConfig('mcp.rateLimit', {
  /** Limit the tool calls of each authenticated user, counted in the `Memory` provider. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** Maximum tool calls of a user per window. Default: `60`. */
  MAX: Type.Integer({ default: 60, minimum: 1 }),
  /** The window in milliseconds. Default: `60000` (1 min). */
  WINDOW: Type.Integer({ default: 60000, minimum: 1 })
});

export const mcpOAuth2Config = defineConfig('mcp.oauth2', {
  /** Make the application the OAuth 2.1 authorization server of the MCP clients, signing the users in with the
   * OAuth2 providers of `security.oauth2`, and with their password with `passwordEnabled`. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** Path of the authorization, token and registration endpoints. Default: `'/oauth'`. */
  ROUTE_PREFIX: Type.String({ default: '/oauth' }),
  /** The OAuth2 providers offered to sign in, by name (`google`, `github`, ...). Default: every enabled one. */
  PROVIDERS: Type.Array(Type.String(), { default: [] }),
  /** Ask for the password of an account to link and the 2FA code on the sign-in forms, otherwise refuse these users.
   * Default: `true`. */
  FORMS_ENABLED: Type.Boolean({ default: true }),
  /** Offer a form signing the users in with their email and password on the sign-in page, counted with the logins of
   * the API (`checkLoginRateLimit` of web). Needs `formsEnabled`, and is left out while the login requires a bot check
   * (`authRoutes` of `security.recaptcha` or `security.turnstile`). Default: `false`. */
  PASSWORD_ENABLED: Type.Boolean({ default: false })
});
