import { defineModule } from '@appweaver/common';
import { mcpConfig, mcpOAuth2Config } from './config';

/** The MCP server of the application: the resource actions and the custom tools exposed to the AI agents. */
export default defineModule({
  name: '@appweaver/mcp',
  requires: ['@appweaver/web'],
  config: [mcpConfig, mcpOAuth2Config],
  loggers: ['mcp'],
  web: async () => (await import('./web/mcp-routes')).registerMcpRoutes()
});
