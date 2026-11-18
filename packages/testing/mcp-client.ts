/** Injects an HTTP request into a server, i.e. `app.server.inject` of Fastify. */
export type InjectRequest = (request: {
  method: 'POST';
  url: string;
  headers: Record<string, string>;
  payload: Record<string, unknown>;
}) => Promise<{ statusCode: number; json(): any }>;

/** A test client of the MCP server of `@appweaver/mcp`. */
export type McpTestClient = {
  /** Sends a JSON-RPC request, returning its `result`, or throwing its `error` or a failed HTTP response. */
  request(method: string, params?: Record<string, unknown>): Promise<any>;
  /** Lists the tools of the user of the client. */
  listTools(): Promise<{ name: string; [key: string]: unknown }[]>;
  /** Calls a tool, returning its result: `content`, `structuredContent` and `isError`. */
  callTool(name: string, args?: Record<string, unknown>): Promise<any>;
};

/**
 * Creates a client of the MCP server of an application, sending the requests through `inject` of its server, so a
 * test lists and calls the tools as the user of the given headers.
 *
 * @example
 * const mcp = createMcpClient((request) => app.server.inject(request), {
 *   headers: { 'x-api-key': apiKey }
 * });
 * const { structuredContent } = await mcp.callTool('order_find', { id: 1 });
 *
 * @param {InjectRequest} inject - Injects a request into the server.
 * @param {Object} [options] - The path of the endpoint (default `/api/mcp`) and the headers of the requests.
 * @return {McpTestClient} The client.
 */
export function createMcpClient(
  inject: InjectRequest,
  options: { path?: string; headers?: Record<string, string> } = {}
): McpTestClient {
  let id = 0;
  const request = async (
    method: string,
    params?: Record<string, unknown>
  ): Promise<any> => {
    const response = await inject({
      method: 'POST',
      url: options.path ?? '/api/mcp',
      headers: { 'content-type': 'application/json', ...options.headers },
      payload: { jsonrpc: '2.0', id: ++id, method, params }
    });
    const body = response.json();
    if (response.statusCode !== 200) {
      throw Object.assign(
        new Error(`MCP request failed with ${response.statusCode}`),
        { statusCode: response.statusCode, body }
      );
    }
    if (body.error) {
      throw Object.assign(new Error(body.error.message), body.error);
    }
    return body.result;
  };
  return {
    request,
    listTools: async () => (await request('tools/list')).tools,
    callTool: (name, args = {}) =>
      request('tools/call', { name, arguments: args })
  };
}
