import { BaseModule } from './base-module';
import { BaseClientInterface, ObservableLike } from '../base-client-interface';
import { ClientError, ClientProblem } from '../../errors';

/** The channels, resources, actions and streams of the realtime connections of an API, typing a
 * {@link RealtimeClient}. */
export type RealtimeType = {
  /** The channels by their names, with their payloads and subscription parameters */
  channels: Record<string, { payload: unknown; params: unknown }>;
  /** The models exposing their resource events, with the actions and the record of an event */
  resources: Record<string, { actions: string; record: unknown }>;
  /** The actions by their names, with their payloads and results, and the chunks of a streaming action */
  actions: Record<
    string,
    { payload: unknown; response: unknown; chunk?: unknown; input?: unknown }
  >;
  /** The streams by their names, with their chunks and subscription parameters */
  streams?: Record<string, { chunk: unknown; params: unknown }>;
};

/** The streams of a {@link RealtimeType}. */
type StreamsOf<R extends RealtimeType> = NonNullable<R['streams']>;

/** The chunk the client streams to an action with an input. */
type InputOf<
  R extends RealtimeType,
  A extends keyof R['actions']
> = R['actions'][A] extends { input: infer I } ? I : unknown;

/** The chunk of a streaming action. */
type ChunkOf<
  R extends RealtimeType,
  A extends keyof R['actions']
> = R['actions'][A] extends { chunk: infer C } ? C : unknown;

/** A stream a subscription or a streaming action receives. */
export type RealtimeStreamInfo = {
  /** The ID of the stream, the same on every connection receiving it */
  streamId: string;
  /** The key of the stream, the ID of the stream of an action */
  key: string;
  /** The codec of the chunks: strings, JSON values, or bytes */
  codec: 'text' | 'json' | 'binary';
  /** The media type of the bytes of a `binary` stream */
  mimeType?: string;
};

/** The metadata of a chunk of a stream. */
export type RealtimeChunkMeta = {
  /** The ID of the stream */
  streamId: string;
  /** The sequence number of the chunk */
  seq: number;
  /** Whether chunks before this one were missed, read too slowly or lost in a reconnection */
  gap: boolean;
  /** Whether a subscriber can start from the chunk, i.e. a key frame */
  sync: boolean;
};

/** The callbacks of a subscription to a stream, receiving every stream of its key. */
export type RealtimeStreamHandlers<T> = {
  /** A stream of the key starts */
  onStart?(stream: RealtimeStreamInfo): void;
  /** A chunk of a stream, a string, a JSON value, or the bytes of a `binary` stream */
  onChunk?(chunk: T, meta: RealtimeChunkMeta): void;
  /** A stream ends, with its result */
  onEnd?(result: unknown, stream: RealtimeStreamInfo): void;
  /** A stream ends with an error */
  onError?(error: ClientError, stream: RealtimeStreamInfo): void;
};

/** The call of a streaming action: its chunks as they come, read as an async iterable, and its result. */
export interface RealtimeCall<T, Result, I = unknown> extends AsyncIterable<T> {
  /** Resolves with the result the stream ends with, rejects with its error or once cancelled */
  readonly result: Promise<Result>;
  /** The stream, once started */
  readonly stream: RealtimeStreamInfo | undefined;
  /** The input of an action receiving one: the chunks the client streams to it, over the WebSocket only */
  readonly input: RealtimeCallInput<I>;
  /**
   * Listens to the chunks, besides the iteration.
   *
   * @param {Function} listener - Receives every chunk.
   * @return {Function} Removes the listener.
   */
  onChunk(listener: (chunk: T, meta: RealtimeChunkMeta) => void): () => void;
  /** Cancels the call, stopping the action on the server. */
  cancel(): void;
}

/** The input a client streams to an action, sent as fast as the server reads it. */
export interface RealtimeCallInput<I> {
  /**
   * Sends a chunk: a string, a JSON value, or bytes sent as a binary message. Keep a chunk under the
   * `realtime.maxMessageSize` of the server.
   *
   * @param {Object} chunk - The chunk.
   * @return {Promise<void>} Resolves once sent, waiting while the server has not read the chunks before it.
   * @throws {ClientError} `REQUEST_FAILED` once the call ended, or over SSE.
   */
  write(chunk: I): Promise<void>;
  /** Ends the input once the chunks written are sent. */
  end(): void;
}

/** A transport of the realtime connections. */
export type RealtimeTransport = 'websocket' | 'sse';

/** The state of the connection of a {@link RealtimeClient}. */
export type RealtimeState = 'idle' | 'connecting' | 'open' | 'reconnecting';

/** An event of a resource the connection receives. */
export type RealtimeResourceEvent<
  R extends RealtimeType,
  M extends keyof R['resources']
> = {
  /** The name of the model */
  model: M;
  /** The action changing the resource */
  action: R['resources'][M]['actions'];
  /** The resource after the action, the deleted resource for a delete */
  current: R['resources'][M]['record'];
  /** The resource before an update */
  previous?: R['resources'][M]['record'];
};

/** The metadata of a received event. */
export type RealtimeEventMeta = {
  /** The ID of the event, the same on every connection receiving it */
  eventId: string;
  /** The channel of the event */
  channel: string;
};

/** A subscription of a {@link RealtimeClient}. */
export type RealtimeSubscription = {
  /** The ID of the subscription */
  readonly id: string;
  /** Resolves once the server accepted the subscription, rejects with the `ClientError` of a refused one */
  readonly ready: Promise<void>;
  /** Removes the subscription */
  unsubscribe(): void;
};

/** The options of a {@link RealtimeClient}. */
export type RealtimeClientOptions = {
  /** The transport: `websocket`, `sse`, or `auto` for the WebSocket when the runtime has one and the server enables
   * it, otherwise SSE. Default: `auto` */
  transport?: 'auto' | RealtimeTransport;
  /** Connect as an anonymous client, without a ticket, to the public channels and actions of a server allowing it:
   * `true` always, `'auto'` when the ticket is refused for want of credentials (`401`), i.e. on a page the user may
   * log in to later, calling {@link RealtimeClient.reconnect} once logged in. Default: `false` */
  anonymous?: boolean | 'auto';
  /** Reconnect after a lost connection, with the subscriptions. Default: `true` */
  reconnect?: boolean;
  /** Milliseconds before the first reconnection, doubled up to `maxReconnectDelay`, each delay randomized from its
   * half to itself so the clients of a server do not reconnect at once. A server restarting (`1012`) is left within
   * the first delay. Default: `500` */
  reconnectDelay?: number;
  /** Milliseconds between the reconnections at most. Default: `30000` */
  maxReconnectDelay?: number;
  /** Milliseconds an action waits for its result. Default: `30000` */
  actionTimeout?: number;
  /** The WebSocket implementation, the global one by default */
  WebSocket?: typeof WebSocket;
};

type ServerMessage =
  | {
      type: 'welcome';
      connectionId: string;
      expiresAt: string | null;
      heartbeat: number;
    }
  | { type: 'subscribed'; id: string }
  | { type: 'unsubscribed'; id: string }
  | {
      type: 'event';
      id: string;
      channel: string;
      eventId: string;
      data: unknown;
    }
  | { type: 'result'; id: string; result: unknown }
  | { type: 'error'; id?: string; error: ClientProblem }
  | { type: 'pong'; id?: string }
  | { type: 'reauth' }
  | { type: 'input.credit'; id: string; bytes: number }
  | {
      type: 'stream.start';
      id: string;
      sid: number;
      streamId: string;
      stream: string;
      key: string;
      codec: RealtimeStreamInfo['codec'];
      mimeType?: string;
      seq: number;
    }
  | { type: 'chunk'; sid: number; seq: number; data: unknown; sync?: true }
  | { type: 'stream.gap'; sid: number; from: number; to: number }
  | {
      type: 'stream.end';
      sid: number;
      seq: number;
      result?: unknown;
      cancelled?: true;
    }
  | { type: 'stream.error'; sid: number; seq: number; error: ClientProblem };

/** A stream received, and the last chunk of it. */
type StreamState = {
  info: RealtimeStreamInfo;
  lastSeq: number;
  gap: boolean;
};

type Entry = {
  id: string;
  channel: string;
  params?: Record<string, unknown>;
  filter?: Record<string, unknown>;
  key?: string;
  handler: (data: any, meta: RealtimeEventMeta) => void;
  stream?: {
    handlers: RealtimeStreamHandlers<any>;
    streams: Map<string, StreamState>;
  };
  settle?: { resolve: () => void; reject: (e: unknown) => void };
};

/** The streams of a connection, or of the response of a call, by their IDs on the server. */
type StreamRoutes = Map<
  number,
  { state: StreamState; entry?: Entry; call?: CallStream }
>;

type Pending = {
  resolve: (value: unknown) => void;
  reject: (e: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

type Transport = {
  close(): void;
  send?(message: unknown): void;
  sendRaw?(data: string | Uint8Array): void;
};

/** The close codes of the server after which the client reconnects at once, with a new ticket. */
const REAUTHENTICATE = 4401;

/** The close code of a server restarting, i.e. on a rolling update: the client reconnects at once to another one. */
const SERVICE_RESTART = 1012;

/**
 * The realtime connection of a client, over a WebSocket or a stream of Server-Sent Events. It connects on the first
 * subscription or action, asks for a ticket with the authentication of the client, and reconnects with its
 * subscriptions after a lost connection or once its token is refreshed.
 *
 * @example
 * const off = client.realtime.subscribe('order.shipped', (payload) => console.log(payload), { orderId: 1 });
 * client.realtime.on('Post', (event) => console.log(event.action, event.current), { action: 'update' });
 * const result = await client.realtime.send('chat.typing', { roomId: 1 });
 * client.realtime.emit('cursor.move', { x: 10, y: 20 });
 */
export class RealtimeClient<
  R extends RealtimeType = RealtimeType
> extends BaseModule {
  /** @internal */
  private readonly _entries = new Map<string, Entry>();
  /** @internal */
  private readonly _pending = new Map<string, Pending>();
  /** @internal */
  private readonly _calls = new Map<string, CallStream>();
  /** @internal */
  private _streams: StreamRoutes = new Map();
  /** @internal */
  private readonly _stateListeners = new Set<(state: RealtimeState) => void>();
  /** @internal */
  private readonly _errorListeners = new Set<(error: ClientError) => void>();
  /** @internal */
  private _transport?: Transport;
  /** @internal */
  private _connecting?: Promise<void>;
  /** @internal */
  private _state: RealtimeState = 'idle';
  /** @internal */
  private _sequence: number = 0;
  /** @internal */
  private _attempts: number = 0;
  /** @internal */
  private _reconnectTimer?: ReturnType<typeof setTimeout>;
  /** @internal */
  private _restartScheduled: boolean = false;
  /** @internal */
  private _connectionId?: string;
  /** @internal */
  private _authenticated: boolean = false;

  /**
   * @param {BaseClientInterface} _baseClient - The client sending the requests of the tickets and the actions.
   * @param {string} basePath - The path of the realtime routes, i.e. `/api/realtime`.
   * @param {RealtimeClientOptions} [_options] - The options of the connection.
   * @param {string[]} [_serverTransports] - The transports the server enables, of its OpenAPI document, which `auto`
   * chooses from. Every transport when unknown.
   */
  constructor(
    private readonly _baseClient: BaseClientInterface,
    public readonly basePath: string,
    private readonly _options: RealtimeClientOptions = {},
    private readonly _serverTransports?: readonly RealtimeTransport[]
  ) {
    super(_baseClient);
  }

  /** The state of the connection. */
  public get state(): RealtimeState {
    return this._state;
  }

  /** Whether the connection is of an authenticated user, false for an anonymous one or none. */
  public get authenticated(): boolean {
    return this._state === 'open' && this._authenticated;
  }

  /** The ID of the open connection on the server. */
  public get connectionId(): string | undefined {
    return this._connectionId;
  }

  /** The transport the client connects with. */
  public get transport(): RealtimeTransport {
    const transport = this._options.transport ?? 'auto';
    if (transport !== 'auto') {
      return transport;
    }
    const enabled = (name: RealtimeTransport) =>
      !this._serverTransports || this._serverTransports.includes(name);

    if (this.webSocketClass() && enabled('websocket')) {
      return 'websocket';
    }
    return enabled('sse') ? 'sse' : 'websocket';
  }

  /**
   * Subscribes to a channel.
   *
   * @param {string} channel - The name of the channel.
   * @param {Function} handler - Receives the payload of every event.
   * @param {Object} [params] - The parameters of the subscription.
   * @return {RealtimeSubscription} The subscription.
   */
  public subscribe<C extends keyof R['channels'] & string>(
    channel: C,
    handler: (
      payload: R['channels'][C]['payload'],
      meta: RealtimeEventMeta
    ) => void,
    params?: R['channels'][C]['params']
  ): RealtimeSubscription {
    return this.add({
      channel,
      handler,
      params: params as Record<string, unknown> | undefined
    });
  }

  /**
   * Subscribes to the events of a resource, all the ones the model exposes or those of an action, optionally only the
   * ones of the resources matching a query filter.
   *
   * @param {string} model - The name of the model.
   * @param {Function} handler - Receives every event.
   * @param {Object} [options] - The action and the filter of the subscription.
   * @return {RealtimeSubscription} The subscription.
   */
  public on<M extends keyof R['resources'] & string>(
    model: M,
    handler: (
      event: RealtimeResourceEvent<R, M>,
      meta: RealtimeEventMeta
    ) => void,
    options: {
      action?: R['resources'][M]['actions'];
      filter?: Record<string, unknown>;
    } = {}
  ): RealtimeSubscription {
    return this.add({
      channel: `resource:${model}${options.action ? `.${options.action}` : ''}`,
      handler,
      filter: options.filter
    });
  }

  /**
   * Observes a channel, emitting the payload of every event to the observers, i.e. for the `from` of RxJS.
   *
   * @param {string} channel - The name of the channel.
   * @param {Object} [params] - The parameters of the subscription.
   * @return {ObservableLike} The observable, subscribing while it has an observer.
   */
  public observe<C extends keyof R['channels'] & string>(
    channel: C,
    params?: R['channels'][C]['params']
  ): ObservableLike<R['channels'][C]['payload']> {
    const observable = {
      subscribe: (observer?: {
        next?: (value: R['channels'][C]['payload']) => void;
        error?: (error: any) => void;
      }) => {
        const subscription = this.subscribe(
          channel,
          (payload) => observer?.next?.(payload),
          params
        );
        subscription.ready.catch((e) => observer?.error?.(e));
        return { unsubscribe: () => subscription.unsubscribe() };
      },
      ['@@observable']: () => observable
    };
    return observable;
  }

  /**
   * Calls an action and waits for its result.
   *
   * @param {string} action - The name of the action.
   * @param {Object} payload - The payload of the action.
   * @return {Promise} The result of the action.
   * @throws {ClientError} The error of the action, or `REQUEST_FAILED` for a lost connection or a timeout.
   */
  public async send<A extends keyof R['actions'] & string>(
    action: A,
    payload: R['actions'][A]['payload']
  ): Promise<R['actions'][A]['response']> {
    if (this.transport === 'sse') {
      const { result } = await this.sendRequest(
        'post',
        `${this.basePath}/actions/${action}`,
        { body: payload }
      );
      return result;
    }

    await this.connect();
    const id = this.nextId('a');

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(requestFailed(`Realtime action '${action}' timed out`));
      }, this._options.actionTimeout ?? 30000);
      this._pending.set(id, { resolve, reject, timer });
      this._transport?.send?.({ type: 'action', id, action, payload });
    });
  }

  /**
   * Calls an action without waiting for it, fire-and-forget, i.e. for data whose loss is harmless such as a cursor
   * position. Its errors are not reported.
   *
   * @param {string} action - The name of the action.
   * @param {Object} payload - The payload of the action.
   */
  public emit<A extends keyof R['actions'] & string>(
    action: A,
    payload: R['actions'][A]['payload']
  ): void {
    if (this.transport === 'sse') {
      this.sendRequest('post', `${this.basePath}/actions/${action}`, {
        body: payload,
        params: { query: { ack: false } }
      }).catch(() => undefined);
      return;
    }

    this.connect()
      .then(() => this._transport?.send?.({ type: 'action', action, payload }))
      .catch(() => undefined);
  }

  /**
   * Subscribes to a stream of a key, i.e. a chat room or a radio station, receiving every stream of the key. A stream
   * open when the subscription starts is replayed as the server keeps it, and resumed after a reconnection.
   *
   * @param {string} name - The name of the stream.
   * @param {RealtimeStreamHandlers} handlers - Receive the starts, the chunks and the ends of the streams.
   * @param {Object} [options] - The key and the parameters of the subscription.
   * @return {RealtimeSubscription} The subscription.
   */
  public stream<S extends keyof StreamsOf<R> & string>(
    name: S,
    handlers: RealtimeStreamHandlers<StreamsOf<R>[S]['chunk']>,
    options: { key?: string; params?: StreamsOf<R>[S]['params'] } = {}
  ): RealtimeSubscription {
    return this.add({
      channel: `stream:${name}`,
      handler: () => undefined,
      key: options.key ?? '',
      params: options.params as Record<string, unknown> | undefined,
      stream: { handlers, streams: new Map() }
    });
  }

  /**
   * Calls a streaming action, receiving its chunks as they come, i.e. the tokens of the answer of an LLM. Over the
   * WebSocket a call survives a reconnection, resumed where it stopped; over SSE it is the response of an HTTP
   * request.
   *
   * @example
   * const call = client.realtime.call('assistant.prompt', { prompt });
   * for await (const token of call) output += token;
   * const usage = await call.result;
   *
   * @param {string} action - The name of the action.
   * @param {Object} payload - The payload of the action.
   * @return {RealtimeCall} The call.
   */
  public call<A extends keyof R['actions'] & string>(
    action: A,
    payload: R['actions'][A]['payload'],
    options: {
      input?: AsyncIterable<InputOf<R, A>> | ReadableStream<InputOf<R, A>>;
    } = {}
  ): RealtimeCall<ChunkOf<R, A>, R['actions'][A]['response'], InputOf<R, A>> {
    const id = this.nextId('c');

    if (this.transport === 'sse') {
      const controller = new AbortController();
      const call = new CallStream(id, () => controller.abort());
      if (options.input) {
        call.fail(requestFailed('A realtime input needs the WebSocket'));
        return call as never;
      }
      void this.callOverHttp(call, action, payload, controller.signal);
      return call as never;
    }

    const call: CallStream = new CallStream(
      id,
      () => {
        this._calls.delete(id);
        if (this._state === 'open') {
          this._transport?.send?.({ type: 'cancel', id });
        }
      },
      (data) => this._transport?.sendRaw?.(data)
    );
    this._calls.set(id, call);
    this.connect()
      .then(() =>
        this._transport?.send?.({ type: 'action', id, action, payload })
      )
      .catch((e: Error) => {
        this._calls.delete(id);
        call.fail(e);
      });
    if (options.input) {
      void call.pipe(options.input);
    }
    return call as never;
  }

  /**
   * Opens the connection, done by the first subscription or action.
   *
   * @return {Promise<void>} Resolves once the connection is open.
   */
  public connect(): Promise<void> {
    if (this._state === 'open') {
      return Promise.resolve();
    }
    this._connecting ??= this.open().finally(() => {
      this._connecting = undefined;
    });
    return this._connecting;
  }

  /**
   * Opens the connection again with a new ticket and the subscriptions, i.e. once the user logged in or out, so the
   * connection is of the current user. A subscription refused before is not renewed: subscribe to the private
   * channels again once logged in.
   *
   * @return {Promise<void>} Resolves once the new connection is open.
   */
  public reconnect(): Promise<void> {
    this.disconnect();
    this._attempts = 0;
    return this.connect();
  }

  /** Closes the connection without reconnecting, keeping the subscriptions for the next {@link connect}. */
  public disconnect(): void {
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = undefined;
    const transport = this._transport;
    this._transport = undefined;
    this._connectionId = undefined;
    transport?.close();
    this.rejectPending(requestFailed('Realtime connection closed'));
    this.failCalls(requestFailed('Realtime connection closed'));
    this.setState('idle');
  }

  /**
   * Listens to the state of the connection.
   *
   * @param {Function} listener - Receives every new state.
   * @return {Function} Removes the listener.
   */
  public onStateChange(listener: (state: RealtimeState) => void): () => void {
    this._stateListeners.add(listener);
    return () => this._stateListeners.delete(listener);
  }

  /**
   * Listens to the errors of the connection not answering a subscription or an action, i.e. a refused ticket.
   *
   * @param {Function} listener - Receives every error.
   * @return {Function} Removes the listener.
   */
  public onError(listener: (error: ClientError) => void): () => void {
    this._errorListeners.add(listener);
    return () => this._errorListeners.delete(listener);
  }

  /** @internal */
  private add(entry: Omit<Entry, 'id' | 'settle'>): RealtimeSubscription {
    const id = this.nextId('s');
    let settle: Entry['settle'];
    const ready = new Promise<void>((resolve, reject) => {
      settle = { resolve, reject };
    });
    // A refused subscription is reported by its `ready`, which may be ignored
    ready.catch(() => undefined);

    this._entries.set(id, { ...entry, id, settle });

    if (this.transport === 'sse') {
      this.restartStream();
    } else if (this._state === 'open') {
      this.sendSubscribe(this._entries.get(id)!);
    } else {
      this.connect().catch((e) => this.recover(e, [id]));
    }

    return {
      id,
      ready,
      unsubscribe: () => this.remove(id)
    };
  }

  /** @internal */
  private remove(id: string): void {
    if (!this._entries.delete(id)) {
      return;
    }
    if (this.transport === 'sse') {
      this.restartStream();
    } else if (this._state === 'open') {
      this._transport?.send?.({ type: 'unsubscribe', id });
    }
  }

  /** @internal */
  private async open(): Promise<void> {
    this.setState(this._attempts > 0 ? 'reconnecting' : 'connecting');

    const ticket =
      this._options.anonymous === true ? undefined : await this.ticket();
    this._authenticated = ticket !== undefined;
    const query = new URLSearchParams();
    if (ticket) {
      query.set('ticket', ticket);
    }

    if (this.transport === 'websocket') {
      await this.openWebSocket(query);
    } else {
      await this.openEventStream(query);
    }
  }

  /** @internal */
  private async ticket(): Promise<string | undefined> {
    try {
      const { ticket } = await this.sendRequest(
        'post',
        `${this.basePath}/ticket`
      );
      return ticket;
    } catch (e) {
      if (
        this._options.anonymous === 'auto' &&
        e instanceof ClientError &&
        e.status === 401
      ) {
        return undefined;
      }
      throw e;
    }
  }

  /** @internal */
  private openWebSocket(query: URLSearchParams): Promise<void> {
    const WebSocketClass = this.webSocketClass();
    if (!WebSocketClass) {
      return Promise.reject(requestFailed('WebSocket is not available'));
    }

    const socket = new WebSocketClass(
      `${this.url('ws').replace(/^http/, 'ws')}?${query}`
    );
    const transport: Transport = {
      close: () => socket.close(1000),
      send: (message) => transport.sendRaw!(JSON.stringify(message)),
      sendRaw: (data) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(data);
        }
      }
    };
    this._transport = transport;

    return new Promise((resolve, reject) => {
      let welcomed = false;

      socket.addEventListener('message', (event) => {
        const message = parse(String(event.data));
        if (message?.type === 'welcome') {
          welcomed = true;
          this.opened(message.connectionId);
          for (const entry of this._entries.values()) {
            this.sendSubscribe(entry);
          }
          this.resumeCalls();
          resolve();
        }
        if (message) {
          this.handle(message, !welcomed ? reject : undefined);
        }
      });

      socket.addEventListener('close', (event) => {
        if (this._transport !== transport) {
          return;
        }
        if (!welcomed) {
          reject(requestFailed('Realtime connection refused'));
        }
        this.lost(event.code);
      });
    });
  }

  /** @internal */
  private async openEventStream(query: URLSearchParams): Promise<void> {
    const subscriptions = [...this._entries.values()].map((entry) =>
      subscriptionOf(entry)
    );
    if (subscriptions.length > 0) {
      query.set('subscriptions', JSON.stringify(subscriptions));
    }

    const controller = new AbortController();
    const transport: Transport = { close: () => controller.abort() };
    this._transport = transport;

    const fetchFn = this.config().fetch ?? fetch;
    const response = await fetchFn(`${this.url('events')}?${query}`, {
      headers: { accept: 'text/event-stream' },
      signal: controller.signal
    });

    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => undefined);
      throw ClientError.fromResponse(data, response, {
        method: 'get',
        path: `${this.basePath}/events`
      });
    }

    const body = response.body;

    return new Promise((resolve, reject) => {
      let welcomed = false;
      let closeCode = 1006;

      const read = async (): Promise<void> => {
        try {
          await readEvents(
            body,
            (message) => {
              if (message.type === 'welcome') {
                welcomed = true;
                this.opened(message.connectionId);
                resolve();
              }
              this.handle(message);
            },
            // An event stream tells its close code in a comment
            (comment) => {
              const match = /^close (\d+)/.exec(comment);
              if (match) {
                closeCode = Number(match[1]);
              }
            }
          );
        } catch {
          // Aborted, or the connection is lost
        }

        if (this._transport === transport) {
          if (!welcomed) {
            reject(requestFailed('Realtime connection refused'));
          }
          this.lost(closeCode);
        }
      };

      void read();
    });
  }

  /** @internal */
  private handle(
    message: ServerMessage,
    rejectOpen?: (e: unknown) => void
  ): void {
    switch (message.type) {
      case 'event': {
        const entry = this._entries.get(message.id);
        entry?.handler(message.data, {
          eventId: message.eventId,
          channel: message.channel
        });
        return;
      }
      case 'subscribed':
        this._entries.get(message.id)?.settle?.resolve();
        return;
      case 'input.credit':
        this._calls.get(message.id)?.credit(message.bytes);
        return;
      case 'result': {
        const call = this._calls.get(message.id);
        if (call) {
          this._calls.delete(message.id);
          call.finish(message.result);
          return;
        }
        const pending = this._pending.get(message.id);
        if (pending) {
          clearTimeout(pending.timer);
          this._pending.delete(message.id);
          pending.resolve(message.result);
        }
        return;
      }
      case 'stream.start':
      case 'chunk':
      case 'stream.gap':
      case 'stream.end':
      case 'stream.error':
        this.handleStream(message, this._streams, (id) => ({
          entry: this._entries.get(id),
          call: this._calls.get(id)
        }));
        return;
      case 'error': {
        const error = problemError(message.error);
        if (message.id && this._calls.has(message.id)) {
          const call = this._calls.get(message.id)!;
          this._calls.delete(message.id);
          call.fail(error);
        } else if (message.id && this._pending.has(message.id)) {
          const pending = this._pending.get(message.id)!;
          clearTimeout(pending.timer);
          this._pending.delete(message.id);
          pending.reject(error);
        } else if (message.id && this._entries.has(message.id)) {
          this.fail(message.id, error);
        } else {
          rejectOpen?.(error);
          this._errorListeners.forEach((listener) => listener(error));
        }
        return;
      }
      default:
        return;
    }
  }

  /** @internal */
  private opened(connectionId: string): void {
    this._attempts = 0;
    this._connectionId = connectionId;
    // The IDs of the streams belong to the connection
    this._streams = new Map();
    this.setState('open');
  }

  /** @internal */
  private lost(code: number): void {
    this._transport = undefined;
    this._connectionId = undefined;
    this.rejectPending(requestFailed('Realtime connection lost'));

    // A started call resumes on the next connection, never its input
    const reconnect = this._options.reconnect !== false;
    for (const [id, call] of this._calls) {
      if (!reconnect || !call.state || call.streaming) {
        this._calls.delete(id);
        call.fail(requestFailed('Realtime connection lost'));
      }
    }

    if (!reconnect || (this._entries.size === 0 && this._calls.size === 0)) {
      this.setState('idle');
      return;
    }

    this.setState('reconnecting');
    const backoff = Math.min(
      (this._options.reconnectDelay ?? 500) * 2 ** this._attempts,
      this._options.maxReconnectDelay ?? 30000
    );
    // Randomized, so the clients of a restarting server spread over the others
    const delay =
      code === REAUTHENTICATE
        ? 0
        : code === SERVICE_RESTART
          ? Math.random() * backoff
          : backoff * (0.5 + Math.random() * 0.5);
    this._attempts++;
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = undefined;
      this.connect().catch((e) => this.recover(e, this._entries.keys()));
    }, delay);
  }

  /** @internal */
  private restartStream(): void {
    if (this._restartScheduled) {
      return;
    }
    this._restartScheduled = true;
    // The subscriptions added at once share one stream
    queueMicrotask(() => {
      this._restartScheduled = false;
      const transport = this._transport;
      this._transport = undefined;
      transport?.close();
      if (this._entries.size === 0) {
        this.setState('idle');
        return;
      }
      this._state = 'idle';
      this.connect().catch((e) => this.recover(e, this._entries.keys()));
    });
  }

  /** @internal */
  private sendSubscribe(entry: Entry): void {
    this._transport?.send?.({ type: 'subscribe', ...subscriptionOf(entry) });
  }

  /** @internal */
  private resumeCalls(): void {
    for (const call of this._calls.values()) {
      if (call.state) {
        this._transport?.send?.({
          type: 'resume',
          id: call.id,
          streamId: call.state.info.streamId,
          seq: call.state.lastSeq + 1
        });
      }
    }
  }

  /** @internal */
  private failCalls(error: ClientError): void {
    for (const [id, call] of this._calls) {
      this._calls.delete(id);
      call.fail(error);
    }
  }

  /**
   * Calls a streaming action over HTTP, reading the Server-Sent Events of its response.
   *
   * @internal
   */
  private async callOverHttp(
    call: CallStream,
    action: string,
    payload: unknown,
    signal: AbortSignal
  ): Promise<void> {
    const path = `${this.basePath}/actions/${action}`;
    try {
      const { error, response } = await this.sendRequestRaw('post', path, {
        body: payload,
        parseAs: 'stream',
        headers: { accept: 'text/event-stream' },
        signal
      });
      if (error) {
        throw ClientError.fromResponse(error, response, {
          method: 'post',
          path
        });
      }

      const routes: StreamRoutes = new Map();
      await readEvents(response.body!, (message) =>
        this.handleStream(message, routes, () => ({ call }))
      );
      call.fail(requestFailed('Realtime stream ended early'));
    } catch (e) {
      call.fail(
        e instanceof ClientError
          ? e
          : requestFailed(e instanceof Error ? e.message : String(e))
      );
    }
  }

  /**
   * Handles a message of a stream: its start, a chunk, a gap, its end.
   *
   * @internal
   */
  private handleStream(
    message: ServerMessage,
    routes: StreamRoutes,
    target: (id: string) => { entry?: Entry; call?: CallStream }
  ): void {
    if (message.type === 'stream.start') {
      const { entry, call } = target(message.id);
      const known =
        entry?.stream?.streams.get(message.streamId) ??
        (call?.state?.info.streamId === message.streamId
          ? call.state
          : undefined);
      const state: StreamState = known ?? {
        info: {
          streamId: message.streamId,
          key: message.key,
          codec: message.codec,
          ...(message.mimeType ? { mimeType: message.mimeType } : {})
        },
        lastSeq: message.seq - 1,
        gap: false
      };

      if (entry?.stream) {
        routes.set(message.sid, { state, entry });
        if (!known) {
          entry.stream.streams.set(message.streamId, state);
          entry.stream.handlers.onStart?.(state.info);
        }
      } else if (call) {
        routes.set(message.sid, { state, call });
        call.state = state;
      }
      return;
    }

    if (!('sid' in message)) {
      return;
    }
    const route = routes.get(message.sid);
    if (!route) {
      return;
    }
    const { state, entry, call } = route;

    switch (message.type) {
      case 'stream.gap':
        state.gap = true;
        return;
      case 'chunk': {
        if (message.seq <= state.lastSeq) {
          return;
        }
        const meta: RealtimeChunkMeta = {
          streamId: state.info.streamId,
          seq: message.seq,
          gap: state.gap || message.seq > state.lastSeq + 1,
          sync: message.sync === true
        };
        state.gap = false;
        state.lastSeq = message.seq;
        const chunk = decodeChunk(state.info.codec, message.data);
        entry?.stream?.handlers.onChunk?.(chunk, meta);
        call?.push(chunk, meta);
        return;
      }
      case 'stream.end':
      case 'stream.error': {
        routes.delete(message.sid);
        entry?.stream?.streams.delete(state.info.streamId);
        if (call) {
          this._calls.delete(call.id);
        }
        if (message.type === 'stream.error') {
          const error = problemError(message.error);
          entry?.stream?.handlers.onError?.(error, state.info);
          call?.fail(error);
        } else if (message.cancelled) {
          entry?.stream?.handlers.onEnd?.(undefined, state.info);
          call?.fail(requestFailed('Realtime stream cancelled'));
        } else {
          entry?.stream?.handlers.onEnd?.(message.result, state.info);
          call?.finish(message.result);
        }
        return;
      }
      default:
        return;
    }
  }

  /**
   * Handles a failed connection: a refusal of the server fails the subscriptions waiting for it, any other error, i.e.
   * a server or a network down, is reported and retried with the backoff of the reconnections.
   *
   * @internal
   */
  private recover(error: unknown, ids: Iterable<string>): void {
    if (isRefusal(error)) {
      for (const id of [...ids]) {
        this.fail(id, error);
      }
      if (!this._transport) {
        this.setState('idle');
      }
      return;
    }

    this.report(error);
    // A transport lost before its welcome already scheduled the next attempt
    if (this._state !== 'idle' && this._reconnectTimer === undefined) {
      this.lost(1006);
    }
  }

  /** @internal */
  private fail(id: string, error: unknown): void {
    const entry = this._entries.get(id);
    if (!entry) {
      return;
    }
    // A refused subscription is not renewed by a reconnection
    this._entries.delete(id);
    entry.settle?.reject(error);
    this.report(error);
  }

  /** @internal */
  private report(error: unknown): void {
    const clientError =
      error instanceof ClientError
        ? error
        : requestFailed(error instanceof Error ? error.message : String(error));
    this._errorListeners.forEach((listener) => listener(clientError));
  }

  /** @internal */
  private rejectPending(error: ClientError): void {
    for (const [id, pending] of this._pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this._pending.delete(id);
    }
  }

  /** @internal */
  private setState(state: RealtimeState): void {
    if (this._state !== state) {
      this._state = state;
      this._stateListeners.forEach((listener) => listener(state));
    }
  }

  /** @internal */
  private url(path: string): string {
    const baseUrl = (this.config().baseUrl ?? '').replace(/\/$/, '');
    return `${baseUrl}${this.basePath}/${path}`;
  }

  /** @internal */
  private config(): {
    baseUrl?: string;
    fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  } {
    return (
      (
        this._baseClient as {
          getConfig?: () => ReturnType<RealtimeClient['config']>;
        }
      ).getConfig?.() ?? {}
    );
  }

  /** @internal */
  private webSocketClass(): typeof WebSocket | undefined {
    return (
      this._options.WebSocket ??
      (globalThis as { WebSocket?: typeof WebSocket }).WebSocket
    );
  }

  /** @internal */
  private nextId(prefix: string): string {
    return `${prefix}${++this._sequence}`;
  }
}

/** The call of a streaming action, an async iterable of its chunks. */
class CallStream implements RealtimeCall<unknown, unknown, unknown> {
  public readonly result: Promise<unknown>;
  /** The stream received, and its last chunk */
  public state?: StreamState;

  /** @internal */
  private readonly _chunks: unknown[] = [];
  /** @internal */
  private readonly _waiters: {
    resolve: (result: IteratorResult<unknown>) => void;
    reject: (e: unknown) => void;
  }[] = [];
  /** @internal */
  private readonly _listeners = new Set<
    (chunk: unknown, meta: RealtimeChunkMeta) => void
  >();
  /** @internal */
  private _done: boolean = false;
  /** @internal */
  private _error?: Error;
  /** @internal */
  private _settle!: {
    resolve: (value: unknown) => void;
    reject: (e: unknown) => void;
  };

  /** @internal */
  private readonly _outbox: {
    data: string | Uint8Array;
    size: number;
    resolve: () => void;
    reject: (e: Error) => void;
  }[] = [];
  /** @internal */
  private _credit: number = 0;
  /** @internal */
  private _window?: number;
  /** @internal */
  private _inputState: 'idle' | 'open' | 'ending' | 'ended' = 'idle';

  constructor(
    public readonly id: string,
    private readonly _cancel: () => void,
    private readonly _send?: (data: string | Uint8Array) => void
  ) {
    this.result = new Promise((resolve, reject) => {
      this._settle = { resolve, reject };
    });
    // A failed call is reported by its `result`, which may be ignored
    this.result.catch(() => undefined);
  }

  /** Whether the client is streaming an input not ended, which cannot resume after a lost connection. */
  public get streaming(): boolean {
    return this._inputState === 'open' || this._inputState === 'ending';
  }

  public get input(): RealtimeCallInput<unknown> {
    return {
      write: (chunk) => this.write(chunk),
      end: () => this.endInput()
    };
  }

  /**
   * Streams the chunks of an iterable or a readable stream as the input, then ends it, cancelling the call when the
   * source fails.
   *
   * @param {AsyncIterable | ReadableStream} source - The chunks.
   * @return {Promise<void>} Resolves once the input is sent.
   */
  public async pipe(
    source: AsyncIterable<unknown> | ReadableStream<unknown>
  ): Promise<void> {
    try {
      if ('getReader' in source) {
        const reader = source.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          await this.write(value);
        }
      } else {
        for await (const chunk of source) {
          await this.write(chunk);
        }
      }
      this.endInput();
    } catch {
      this.cancel();
    }
  }

  /**
   * Receives the bytes the server read, sending the chunks waiting for them.
   *
   * @param {number} bytes - The bytes.
   */
  public credit(bytes: number): void {
    this._window ??= bytes;
    this._credit += bytes;
    this.flush();
  }

  public get stream(): RealtimeStreamInfo | undefined {
    return this.state?.info;
  }

  public onChunk(
    listener: (chunk: unknown, meta: RealtimeChunkMeta) => void
  ): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  public cancel(): void {
    if (this._done) {
      return;
    }
    this._cancel();
    this.fail(requestFailed('Realtime stream cancelled'), false);
  }

  public [Symbol.asyncIterator](): AsyncIterator<unknown> {
    return {
      next: () => {
        if (this._chunks.length > 0) {
          return Promise.resolve({ done: false, value: this._chunks.shift() });
        }
        if (this._done) {
          return this._error
            ? Promise.reject(this._error)
            : Promise.resolve({ done: true, value: undefined });
        }
        return new Promise((resolve, reject) =>
          this._waiters.push({ resolve, reject })
        );
      },
      return: () => {
        this.cancel();
        return Promise.resolve({ done: true, value: undefined });
      }
    };
  }

  /** Receives a chunk. */
  public push(chunk: unknown, meta: RealtimeChunkMeta): void {
    if (this._done) {
      return;
    }
    this._listeners.forEach((listener) => listener(chunk, meta));
    const waiter = this._waiters.shift();
    if (waiter) {
      waiter.resolve({ done: false, value: chunk });
    } else {
      this._chunks.push(chunk);
    }
  }

  /** Ends the call with its result. */
  public finish(result: unknown): void {
    if (this._done) {
      return;
    }
    this._done = true;
    this.dropInput();
    this._waiters
      .splice(0)
      .forEach((waiter) => waiter.resolve({ done: true, value: undefined }));
    this._settle.resolve(result);
  }

  /**
   * Ends the call with an error, thrown by the iteration unless the call was cancelled.
   *
   * @param {unknown} error - The error.
   * @param {boolean} [thrown=true] - Whether the iteration throws it.
   */
  public fail(error: Error, thrown: boolean = true): void {
    if (this._done) {
      return;
    }
    this._done = true;
    this.dropInput();
    if (thrown) {
      this._error = error;
    }
    this._waiters
      .splice(0)
      .forEach((waiter) =>
        thrown
          ? waiter.reject(error)
          : waiter.resolve({ done: true, value: undefined })
      );
    this._settle.reject(error);
  }

  /** @internal */
  private write(chunk: unknown): Promise<void> {
    if (this._done || !this._send) {
      return Promise.reject(
        requestFailed(
          this._send
            ? 'Realtime call ended'
            : 'A realtime input needs the WebSocket'
        )
      );
    }
    if (this._inputState !== 'idle' && this._inputState !== 'open') {
      return Promise.reject(requestFailed('Realtime input ended'));
    }
    this._inputState = 'open';

    const data =
      chunk instanceof Uint8Array
        ? inputFrame(this.id, chunk)
        : JSON.stringify({ type: 'input', id: this.id, data: chunk });
    const size = typeof data === 'string' ? data.length : data.byteLength;
    return new Promise((resolve, reject) => {
      this._outbox.push({ data, size, resolve, reject });
      this.flush();
    });
  }

  /** @internal */
  private endInput(): void {
    if (this._inputState === 'idle' || this._inputState === 'open') {
      this._inputState = 'ending';
      this.flush();
    }
  }

  /** @internal */
  private flush(): void {
    while (this._outbox.length > 0 && !this._done) {
      const next = this._outbox[0];
      if (this._window !== undefined && next.size > this._window) {
        this._outbox.shift();
        next.reject(
          requestFailed('Realtime input chunk larger than its window')
        );
        continue;
      }
      if (next.size > this._credit) {
        return;
      }
      this._outbox.shift();
      this._credit -= next.size;
      this._send?.(next.data);
      next.resolve();
    }
    // The end waits for the call to reach the server, told by its credit
    if (
      this._inputState === 'ending' &&
      this._outbox.length === 0 &&
      !this._done &&
      this._window !== undefined
    ) {
      this._inputState = 'ended';
      this._send?.(JSON.stringify({ type: 'input.end', id: this.id }));
    }
  }

  /** @internal */
  private dropInput(): void {
    this._inputState = 'ended';
    for (const item of this._outbox.splice(0)) {
      item.reject(requestFailed('Realtime call ended'));
    }
  }
}

/** A binary message of a chunk of an input: the byte `1`, the length of the ID of the call, the ID, the bytes. */
function inputFrame(id: string, chunk: Uint8Array): Uint8Array {
  const idBytes = new TextEncoder().encode(id);
  const frame = new Uint8Array(2 + idBytes.length + chunk.byteLength);
  frame[0] = 1;
  frame[1] = idBytes.length;
  frame.set(idBytes, 2);
  frame.set(chunk, 2 + idBytes.length);
  return frame;
}

/** The subscription message of an entry, resuming the last stream it received. */
function subscriptionOf(entry: Entry): Record<string, unknown> {
  const streams = [...(entry.stream?.streams.values() ?? [])];
  const last = streams[streams.length - 1];
  return {
    id: entry.id,
    channel: entry.channel,
    ...(entry.params ? { params: entry.params } : {}),
    ...(entry.filter ? { filter: entry.filter } : {}),
    ...(entry.key !== undefined ? { key: entry.key } : {}),
    ...(last
      ? { resume: { streamId: last.info.streamId, seq: last.lastSeq + 1 } }
      : {})
  };
}

/** Decodes a chunk of a stream: the base64 of a `binary` stream to its bytes. */
function decodeChunk(
  codec: RealtimeStreamInfo['codec'],
  data: unknown
): unknown {
  if (codec !== 'binary' || typeof data !== 'string') {
    return data;
  }
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Reads the messages of a body of Server-Sent Events until it ends. */
async function readEvents(
  body: ReadableStream<Uint8Array>,
  onMessage: (message: ServerMessage) => void,
  onComment?: (comment: string) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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
      const lines = block.split('\n');
      for (const line of lines) {
        if (line.startsWith(':')) {
          onComment?.(line.slice(1).trim());
        }
      }
      const data = lines
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n');
      const message = data ? parse(data) : undefined;
      if (message) {
        onMessage(message);
      }
    }
  }
}

function parse(data: string): ServerMessage | undefined {
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

function problemError(problem: ClientProblem): ClientError {
  return new ClientError(problem.detail ?? problem.title ?? 'Realtime error', {
    status: problem.status ?? 500,
    data: problem
  });
}

/**
 * Whether the server refused a connection for good, i.e. invalid subscriptions, rather than for a while: a ticket
 * refused or expired, too many connections, a server or a network error.
 */
function isRefusal(error: unknown): boolean {
  return (
    error instanceof ClientError &&
    error.status >= 400 &&
    error.status < 500 &&
    ![401, 408, 429].includes(error.status)
  );
}

function requestFailed(message: string): ClientError {
  return new ClientError(message, { status: 0 });
}
