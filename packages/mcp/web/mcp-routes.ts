import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Type } from '@sinclair/typebox';
import { AuthError, AuthType, ErrorCode, McpError } from '@appweaver/common';
import { currentAuthUser } from '@appweaver/core';
import { apiKeyConfig } from '@appweaver/data/config';
import { authErrorCodes, registerRoute, Router } from '@appweaver/web';
import { mcpConfig, mcpOAuth2Config } from '../config';
import { resourceMetadataUrl } from '../oauth/oauth-util';
import { handleMcpMessage } from '../server/mcp-server';
import { registerOAuthRoutes } from './oauth-routes';

/**
 * Registers the MCP endpoint, the Streamable HTTP transport without sessions: a `POST` of a JSON-RPC message answered
 * with its JSON response, `202` for a notification. The server opens no stream, so `GET` and `DELETE` answer `405`.
 * With `mcp.oauth2.enabled`, also the OAuth endpoints of the MCP clients, and a `401` names the protected resource
 * metadata in its `WWW-Authenticate` header.
 */
export function registerMcpRoutes(): void {
  if (!mcpConfig.ENABLED) {
    return;
  }
  registerOAuthRoutes();
  const path = `/${mcpConfig.ROUTE_PREFIX.replace(/^\/+|\/+$/g, '')}`;
  const notAllowed = async (_: FastifyRequest, reply: FastifyReply) =>
    reply.code(405).header('allow', 'POST').send();

  registerRoute(
    (router: Router) => {
      router.post(
        path,
        {
          schema: {
            tags: ['MCP'],
            summary: 'Send a message to the MCP server',
            description:
              'The Model Context Protocol endpoint of the AI agents: a JSON-RPC message (`initialize`, ' +
              '`tools/list`, `tools/call`, `ping`) answered with its JSON-RPC response, or `202` for a ' +
              'notification. The tools are the ones the user of the credentials may call.',
            body: Type.Unknown(),
            response: { 200: Type.Unknown(), 202: Type.Null() }
          },
          onRequest: [checkOrigin, optionalAuthentication],
          onSend: challenge,
          config: {
            errorCodes: [...authErrorCodes(), ErrorCode.McpOriginDenied]
          }
        },
        (async (request: FastifyRequest, reply: FastifyReply) => {
          const controller = new AbortController();
          request.raw.once('close', () => controller.abort());
          const response = await handleMcpMessage(
            request.body,
            currentAuthUser() ?? null,
            controller.signal
          );
          return response ? response : reply.code(202).send();
        }) as never
      );
      router.get(
        path,
        { schema: { hide: true } } as never,
        notAllowed as never
      );
      router.delete(
        path,
        { schema: { hide: true } } as never,
        notAllowed as never
      );
    },
    { public: true, apiPrefix: false }
  );
}

/** Points an unauthenticated client to the protected resource metadata, where it finds the authorization server. */
async function challenge(
  _: FastifyRequest,
  reply: FastifyReply,
  payload: unknown
): Promise<unknown> {
  if (reply.statusCode === 401 && mcpOAuth2Config.ENABLED) {
    reply.header(
      'www-authenticate',
      `Bearer resource_metadata="${resourceMetadataUrl()}"`
    );
  }
  return payload;
}

/** Refuses a browser of an origin not allowed, against the DNS rebinding of a local server. */
function checkOrigin(
  request: FastifyRequest,
  _: FastifyReply,
  done: (error?: Error) => void
): void {
  const origin = request.headers.origin;
  const allowed = mcpConfig.ALLOWED_ORIGINS;
  if (origin && !allowed.includes('*') && !allowed.includes(origin)) {
    done(
      new McpError(
        ErrorCode.McpOriginDenied,
        `The origin '${origin}' may not call the MCP server`,
        { origin }
      )
    );
    return;
  }
  done();
}

/** Authenticates a request carrying credentials, and leaves one without any anonymous unless refused. */
function optionalAuthentication(
  this: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  done: (error?: Error) => void
): void {
  const apiKey = apiKeyConfig.ENABLED
    ? request.headers[apiKeyConfig.HEADER_NAME.toLowerCase()]
    : undefined;
  if (request.headers.authorization || apiKey) {
    const { authenticate } = this as unknown as {
      authenticate: (types: AuthType[]) => (...args: unknown[]) => void;
    };
    authenticate(mcpConfig.AUTH as AuthType[]).call(this, request, reply, done);
    return;
  }
  done(
    mcpConfig.ANONYMOUS_ENABLED
      ? undefined
      : new AuthError(ErrorCode.AuthUnauthorized, 'Unauthorized')
  );
}
