import { AsyncResource } from 'node:async_hooks';
import AjvCompiler from '@fastify/ajv-compiler';
import { SerializerSelector } from '@fastify/fast-json-stringify-compiler';
import fastify, { FastifyRequest } from 'fastify';
import { fastifyRequestContext } from '@fastify/request-context';
import {
  AuthError,
  AuthType,
  ErrorCode,
  Events,
  Memory,
  PLUGIN,
  PubSub,
  ROUTE
} from '@appweaver/common';
import {
  define,
  injectAll,
  runInAuthContext,
  setAuthContext
} from '@appweaver/core';
import { InMemory, MemoryPubSub, NodeEvents } from '@appweaver/core/drivers';
import { errorHandler, Server, stashErrorResponses } from '@appweaver/web';
import { RealtimeGateway } from '../../gateway/realtime-gateway';
import { TicketService } from '../../gateway/ticket-service';
import { StreamHub } from '../../stream/stream-hub';
import { registerRealtimeRoutes } from '../../web/realtime-routes';

/** A realtime server listening on a random port, authenticating the `x-user` header as a JWT user. A request of an
 * optional authentication also sends an `Authorization` header to be authenticated. */
export type RealtimeServer = {
  server: Server;
  url: string;
  ws: string;
  gateway: RealtimeGateway;
  close: () => Promise<void>;
};

/**
 * A compiler factory whose compiled schemas are shared by every server of a test file. A new server compiles the
 * schemas of all its routes again, which took most of the time of starting one.
 */
function sharedCompiler<F extends (...options: any[]) => (route: any) => any>(
  factory: F
): F {
  const compiled = new Map<string, unknown>();
  return ((...options: unknown[]) => {
    const compile = factory(...options);
    const prefix = JSON.stringify(options);
    return (route: object) => {
      const key = prefix + JSON.stringify(route);
      if (!compiled.has(key)) {
        compiled.set(key, compile(route));
      }
      return compiled.get(key);
    };
  }) as F;
}

const compilersFactory = {
  buildValidator: sharedCompiler(AjvCompiler()),
  buildSerializer: sharedCompiler(SerializerSelector())
};

/**
 * Starts a server with the realtime routes, the drivers of core and an authentication reading the user of the
 * `x-user` header, with the `exp` of the `x-exp` header.
 */
export async function startRealtimeServer(): Promise<RealtimeServer> {
  define(new InMemory(), Memory);
  define(new MemoryPubSub(), PubSub);
  define(new NodeEvents(), Events);
  define(TicketService);
  define(new StreamHub(), StreamHub);
  define(RealtimeGateway);

  registerRealtimeRoutes();

  const server = fastify({
    forceCloseConnections: true,
    schemaController: { compilersFactory }
  }) as unknown as Server;
  server.register(fastifyRequestContext, {
    createAsyncResource: () =>
      runInAuthContext(() => new AsyncResource('appweaver-request'))
  });
  server.setErrorHandler(errorHandler);
  server.addHook('onRoute', stashErrorResponses);
  // Called back like the handler of @fastify/auth
  server.decorate(
    'authenticate',
    () => (request: FastifyRequest, _: unknown, done: (e?: Error) => void) => {
      const header = request.headers['x-user'];
      if (!header) {
        done(new AuthError(ErrorCode.AuthUnauthorized, 'Unauthorized'));
        return;
      }
      const exp = request.headers['x-exp'];
      if (exp) {
        (request as { user?: unknown }).user = { exp: Number(exp) };
      }
      setAuthContext({
        authUser: JSON.parse(String(header)),
        authType: AuthType.Jwt
      });
      done();
    }
  );

  for (const { plugin } of injectAll<{ plugin: any }>(PLUGIN)) {
    server.register(plugin);
  }
  for (const route of injectAll<any>(ROUTE)) {
    server.register(route, { prefix: '/api/' });
  }

  const address = await server.listen({ port: 0, host: '127.0.0.1' });
  const { inject } = await import('@appweaver/core');
  const gateway = inject(RealtimeGateway);
  const hub = inject(StreamHub);

  return {
    server,
    url: `${address}/api/realtime`,
    ws: `${address.replace('http', 'ws')}/api/realtime`,
    gateway,
    close: async () => {
      await gateway.onDestroy();
      await hub.onDestroy();
      await server.close();
    }
  };
}

/** A WebSocket client collecting the messages of the server. */
export class TestSocket {
  public readonly messages: any[] = [];
  public closeCode?: number;
  private readonly _waiters: (() => void)[] = [];

  constructor(public readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      this.messages.push(JSON.parse(String(event.data)));
      this._waiters.splice(0).forEach((wake) => wake());
    });
    socket.addEventListener('close', (event) => {
      this.closeCode = event.code;
      this._waiters.splice(0).forEach((wake) => wake());
    });
  }

  static async open(url: string): Promise<TestSocket> {
    const socket = new WebSocket(url);
    const client = new TestSocket(socket);
    let timer: NodeJS.Timeout | undefined;
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve());
      socket.addEventListener('error', () => resolve());
      socket.addEventListener('close', () => resolve());
      timer = setTimeout(() => reject(new Error('WebSocket not opened')), 2000);
    }).finally(() => clearTimeout(timer));
    return client;
  }

  send(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }

  /** Waits for the first message matching the predicate, or the close of the socket. */
  async next(
    predicate: (message: any) => boolean,
    timeout: number = 2000
  ): Promise<any> {
    const deadline = Date.now() + timeout;
    for (;;) {
      const found = this.messages.find(predicate);
      if (found || this.closeCode !== undefined) {
        return found;
      }
      if (Date.now() > deadline) {
        throw new Error('No matching message');
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 50);
        this._waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  close(): void {
    this.socket.close();
  }
}

/** Reads the messages of an event stream. */
export async function openEventStream(url: string): Promise<{
  status: number;
  messages: any[];
  comments: string[];
  next: (predicate: (message: any) => boolean) => Promise<any>;
  abort: () => void;
  body: string;
}> {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal });
  const messages: any[] = [];
  const comments: string[] = [];
  const result = {
    status: response.status,
    messages,
    comments,
    body: '',
    abort: () => controller.abort(),
    next: async (predicate: (message: any) => boolean) => {
      const deadline = Date.now() + 2000;
      for (;;) {
        const found = messages.find(predicate);
        if (found) {
          return found;
        }
        if (Date.now() > deadline) {
          throw new Error('No matching event');
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
  };

  if (!response.headers.get('content-type')?.startsWith('text/event-stream')) {
    result.body = await response.text();
    return result;
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        let index: number;
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          for (const line of block.split('\n')) {
            if (line.startsWith('data: ')) {
              messages.push(JSON.parse(line.slice(6)));
            } else if (line.startsWith(':')) {
              comments.push(line.slice(1).trim());
            }
          }
        }
      }
    } catch {
      // Aborted
    }
  })();

  return result;
}
