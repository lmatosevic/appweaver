import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import type { RawData, WebSocket } from 'ws';
import { Type } from '@sinclair/typebox';
import {
  AuthType,
  createLogger,
  AuthError,
  ErrorCode,
  isAppweaverError,
  RealtimeError,
  textToBytes
} from '@appweaver/common';
import {
  currentAuthSource,
  currentAuthType,
  currentAuthUser,
  inject
} from '@appweaver/core';
import {
  registerPlugin,
  registerRoute,
  authErrorCodes,
  registerSpecExtension,
  Router,
  toProblem
} from '@appweaver/web';
import { apiKeyConfig } from '@appweaver/data/config';
import { realtimeConfig } from '../config';
import { ConnectionAuth, RealtimeConnection } from '../gateway/connection';
import { RealtimeGateway } from '../gateway/realtime-gateway';
import { TicketService } from '../gateway/ticket-service';
import { SseConnection } from '../transport/sse-connection';
import { WsConnection } from '../transport/ws-connection';
import { RealtimeCloseCode, SubscriptionRequest } from '../types';
import { realtimeSpec } from './realtime-spec';

const logger = createLogger('realtime');

/** The messages a WebSocket client may send before its ticket is redeemed. */
const EARLY_MESSAGES_LIMIT = 50;

const TicketResponse = Type.Object({
  ticket: Type.String({ description: 'The ticket, used once' }),
  expiresIn: Type.Integer({
    description: 'The milliseconds the ticket is valid for'
  })
});

const ConnectQuery = Type.Object({
  ticket: Type.Optional(
    Type.String({ description: 'The ticket of `POST /ticket`' })
  )
});

const EventsQuery = Type.Composite([
  ConnectQuery,
  Type.Object({
    subscriptions: Type.Optional(
      Type.String({
        description:
          'The subscriptions of the stream, a JSON array of `{ id, channel, params?, filter? }`'
      })
    )
  })
]);

const ActionQuery = Type.Object({
  ack: Type.Optional(
    Type.Boolean({
      description:
        'Wait for the result, `false` to answer with 202 at once (fire-and-forget)',
      default: true
    })
  )
});

/**
 * Registers the WebSocket plugin and the realtime routes under `realtime.routePrefix`: the tickets, the event stream,
 * the WebSocket and the actions, and the `x-appweaver-realtime` extension of the OpenAPI document. The web part of
 * `@appweaver/realtime`.
 */
export function registerRealtimeRoutes(): void {
  if (!realtimeConfig.ENABLED) {
    return;
  }

  const prefix = realtimeConfig.ROUTE_PREFIX.replace(/\/$/, '');

  registerPlugin('appweaver-realtime', (server) => {
    // The open connections would keep the server from closing
    server.addHook('preClose', (done) => {
      inject(RealtimeGateway).closeAll(
        RealtimeCloseCode.GoingAway,
        'Server shutting down'
      );
      done();
    });

    if (realtimeConfig.WEBSOCKET_ENABLED) {
      server.register(fastifyWebsocket, {
        options: { maxPayload: textToBytes(realtimeConfig.MAX_MESSAGE_SIZE) }
      });
    }
  });

  registerRoute(
    (router: Router) => {
      router.post(
        `${prefix}/ticket`,
        {
          schema: {
            tags: ['Realtime'],
            summary: 'Issue a realtime ticket',
            description:
              'Issues a short-lived ticket opening one realtime connection as the authenticated user, since a ' +
              'browser cannot send the credentials with an `EventSource` or a `WebSocket`.',
            response: { 200: TicketResponse }
          }
        },
        async (request) => issueTicket(request)
      );
    },
    { auth: Object.values(AuthType) }
  );

  registerRoute(
    (router: Router) => {
      router.post(
        `${prefix}/actions/:name`,
        {
          schema: {
            tags: ['Realtime'],
            summary: 'Call a realtime action',
            description:
              'Calls an action of the realtime connections with the payload of the body, answering with its ' +
              'result, or with 202 at once for `ack=false`. The credentials are optional: a call without them ' +
              'is anonymous, allowed for a public action with `realtime.anonymousEnabled`.',
            params: Type.Object({ name: Type.String() }),
            querystring: ActionQuery,
            body: Type.Unknown(),
            response: {
              200: Type.Object({ result: Type.Unknown() }),
              202: Type.Null()
            }
          },
          // Authenticated when the request carries credentials, so the
          // access of each action decides whether it needs a user
          onRequest: optionalAuthentication,
          config: {
            errorCodes: [
              ...authErrorCodes(),
              ErrorCode.RealtimeActionUnknown,
              ErrorCode.RealtimeActionDenied,
              ErrorCode.RealtimePayloadInvalid
            ]
          }
        },
        (async (request: FastifyRequest, reply: FastifyReply) =>
          callAction(request as never, reply)) as never
      );
    },
    { public: true }
  );

  registerRoute(
    (router: Router) => {
      if (realtimeConfig.SSE_ENABLED) {
        router.get(
          `${prefix}/events`,
          {
            schema: {
              tags: ['Realtime'],
              summary: 'Open a realtime event stream',
              description:
                'Opens a Server-Sent Events stream with the subscriptions of the query, every message being the ' +
                'JSON data of an event. The subscriptions change by opening a new stream.',
              querystring: EventsQuery,
              response: {
                200: {
                  description: 'The event stream',
                  content: { 'text/event-stream': { schema: Type.String() } }
                }
              }
            },
            config: {
              errorCodes: [
                ErrorCode.RealtimeTicketInvalid,
                ErrorCode.RealtimeConnectionLimit,
                ErrorCode.RealtimeMessageInvalid
              ],
              rateLimit: false
            } as never
          },
          async (request, reply) => openEventStream(request as never, reply)
        );
      } else {
        router.get(
          `${prefix}/events`,
          { schema: { hide: true } } as never,
          async () => transportDisabled('sse')
        );
      }

      if (realtimeConfig.WEBSOCKET_ENABLED) {
        router.get(
          `${prefix}/ws`,
          {
            websocket: true,
            schema: { querystring: ConnectQuery },
            config: { rateLimit: false } as never
          } as never,
          ((socket: WebSocket, request: FastifyRequest) =>
            openWebSocket(socket, request as never)) as never
        );
      } else {
        router.get(
          `${prefix}/ws`,
          { schema: { hide: true } } as never,
          async () => transportDisabled('websocket')
        );
      }
    },
    { public: true }
  );

  registerSpecExtension('realtime', realtimeSpec);
}

/**
 * Authenticates a request carrying credentials, a bearer or basic `Authorization` header or an API key, and leaves a
 * request without any anonymous, refused unless `realtime.anonymousEnabled`.
 */
function optionalAuthentication(
  this: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  done: (error?: Error) => void
): void {
  const apiKeyHeader = apiKeyConfig.ENABLED
    ? request.headers[apiKeyConfig.HEADER_NAME.toLowerCase()]
    : undefined;

  if (request.headers.authorization || apiKeyHeader) {
    const { authenticate } = this as unknown as {
      authenticate: () => unknown;
    };
    (authenticate() as (...args: unknown[]) => void).call(
      this,
      request,
      reply,
      done
    );
    return;
  }

  done(
    realtimeConfig.ANONYMOUS_ENABLED
      ? undefined
      : new AuthError(ErrorCode.AuthUnauthorized, 'Unauthorized')
  );
}

/** Answers a route of a disabled transport. */
function transportDisabled(transport: 'sse' | 'websocket'): never {
  throw new RealtimeError(
    ErrorCode.RealtimeTransportDisabled,
    `The realtime ${transport} transport is disabled`,
    { transport }
  );
}

async function issueTicket(
  request: FastifyRequest
): Promise<{ ticket: string; expiresIn: number }> {
  const authType = currentAuthType() ?? null;
  const exp = (request as { user?: { exp?: number } }).user?.exp;

  return inject(TicketService).issue({
    user: currentAuthUser()!,
    authType,
    authSource: currentAuthSource() ?? null,
    expiresAt: authType === AuthType.Jwt && exp ? exp * 1000 : null
  });
}

async function callAction(
  request: FastifyRequest<{
    Params: { name: string };
    Querystring: { ack?: boolean };
  }>,
  reply: FastifyReply
): Promise<unknown> {
  const gateway = inject(RealtimeGateway);
  const ack = request.query.ack !== false;
  const call = gateway.callAction(request.params.name, request.body, {
    user: currentAuthUser() ?? null,
    transport: 'http',
    ack
  });

  if (ack) {
    return { result: (await call) ?? null };
  }

  call.catch((e) =>
    logger.debug(
      { err: e, action: request.params.name },
      'Realtime fire-and-forget action failed'
    )
  );
  return reply.status(202).send(null);
}

async function openEventStream(
  request: FastifyRequest<{
    Querystring: { ticket?: string; subscriptions?: string };
  }>,
  reply: FastifyReply
): Promise<void> {
  const gateway = inject(RealtimeGateway);
  const subscriptions = parseSubscriptions(request.query.subscriptions);

  // Listened to before the ticket is redeemed, so a client leaving meanwhile
  // never leaves an open connection behind
  let connection: SseConnection | undefined;
  let left = false;
  request.raw.on('close', () => {
    left = true;
    if (connection) {
      connection.close(RealtimeCloseCode.GoingAway, 'Client disconnected');
      void gateway.release(connection);
    }
  });

  const auth = await connectionAuth(request.query.ticket);
  if (left) {
    reply.hijack();
    return;
  }

  const headers = {
    ...reply.getHeaders(),
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    // Keeps nginx from buffering the stream
    'x-accel-buffering': 'no'
  };
  connection = new SseConnection(auth, reply.raw, () => {
    reply.hijack();
    reply.raw.writeHead(200, headers as never);
  });
  connection.ip = request.ip;

  // Throws the connection limit before anything is written
  try {
    gateway.open(connection);
  } catch (e) {
    connection = undefined;
    throw e;
  }

  await subscribeAll(gateway, connection, subscriptions);
}

async function openWebSocket(
  socket: WebSocket,
  request: FastifyRequest<{ Querystring: { ticket?: string } }>
): Promise<void> {
  const gateway = inject(RealtimeGateway);

  // Listened to before the ticket is redeemed: the messages of the client
  // wait for the connection, and a client leaving meanwhile leaves none
  let connection: WsConnection | undefined;
  let left = false;
  const early: string[] = [];

  socket.on('message', (data, isBinary) => {
    if (isBinary) {
      socket.close(RealtimeCloseCode.PolicyViolation, 'Binary message');
    } else if (connection) {
      void gateway.handleMessage(connection, messageText(data));
    } else if (early.length < EARLY_MESSAGES_LIMIT) {
      early.push(messageText(data));
    }
  });
  socket.on('close', () => {
    left = true;
    if (connection) {
      connection.closed = true;
      void gateway.release(connection);
    }
  });

  try {
    const opened = new WsConnection(
      await connectionAuth(request.query.ticket),
      socket
    );
    if (left) {
      return;
    }
    opened.ip = request.ip;
    gateway.open(opened);
    connection = opened;
  } catch (e) {
    socket.send(JSON.stringify({ type: 'error', error: toProblem(e) }));
    socket.close(
      isAppweaverError(e) &&
        (e.code as ErrorCode) === ErrorCode.RealtimeConnectionLimit
        ? RealtimeCloseCode.TooManyConnections
        : RealtimeCloseCode.Unauthorized,
      'Connection refused'
    );
    return;
  }

  for (const message of early.splice(0)) {
    void gateway.handleMessage(connection, message);
  }
}

/** The text of a WebSocket message, received as one buffer or as fragments. */
function messageText(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString();
  }
  return Buffer.from(data as ArrayBuffer).toString();
}

/** The authentication of a ticket, or of an anonymous connection when they are allowed and there is no ticket. */
async function connectionAuth(ticket?: string): Promise<ConnectionAuth> {
  if (!ticket) {
    if (realtimeConfig.ANONYMOUS_ENABLED) {
      return { user: null, authType: null, authSource: null, expiresAt: null };
    }
    throw new RealtimeError(
      ErrorCode.RealtimeTicketInvalid,
      'Realtime ticket required'
    );
  }

  return inject(TicketService).redeem(ticket);
}

function parseSubscriptions(json?: string): SubscriptionRequest[] {
  if (!json) {
    return [];
  }

  let subscriptions: unknown;
  try {
    subscriptions = JSON.parse(json);
  } catch {
    subscriptions = undefined;
  }

  if (!Array.isArray(subscriptions)) {
    throw new RealtimeError(
      ErrorCode.RealtimeMessageInvalid,
      'The subscriptions must be a JSON array'
    );
  }
  return subscriptions;
}

/** Subscribes an event stream, answering every subscription with `subscribed` or its error. */
async function subscribeAll(
  gateway: RealtimeGateway,
  connection: RealtimeConnection,
  subscriptions: SubscriptionRequest[]
): Promise<void> {
  for (const subscription of subscriptions) {
    try {
      await gateway.subscribe(connection, subscription);
      connection.send({ type: 'subscribed', id: subscription.id });
    } catch (e) {
      connection.send({
        type: 'error',
        ...(typeof subscription?.id === 'string'
          ? { id: subscription.id }
          : {}),
        error: toProblem(e)
      });
    }
  }
}
