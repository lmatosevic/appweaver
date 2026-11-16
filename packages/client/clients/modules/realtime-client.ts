import { BaseModule } from './base-module';
import { BaseClientInterface, ObservableLike } from '../base-client-interface';
import { ClientError, ClientProblem } from '../../errors';

/** The channels, resources and actions of the realtime connections of an API, typing a {@link RealtimeClient}. */
export type RealtimeType = {
  /** The channels by their names, with their payloads and subscription parameters */
  channels: Record<string, { payload: unknown; params: unknown }>;
  /** The models exposing their resource events, with the actions and the record of an event */
  resources: Record<string, { actions: string; record: unknown }>;
  /** The actions by their names, with their payloads and results */
  actions: Record<string, { payload: unknown; response: unknown }>;
};

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
  /** The transport: `websocket`, `sse`, or `auto` for the WebSocket when the runtime has one. Default: `auto` */
  transport?: 'auto' | 'websocket' | 'sse';
  /** Connect without a ticket, as an anonymous client, when the server allows it. Default: `false` */
  anonymous?: boolean;
  /** Reconnect after a lost connection, with the subscriptions. Default: `true` */
  reconnect?: boolean;
  /** Milliseconds before the first reconnection, doubled up to `maxReconnectDelay`. Default: `500` */
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
  | { type: 'reauth' };

type Entry = {
  id: string;
  channel: string;
  params?: Record<string, unknown>;
  filter?: Record<string, unknown>;
  handler: (data: any, meta: RealtimeEventMeta) => void;
  settle?: { resolve: () => void; reject: (e: unknown) => void };
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (e: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
};

type Transport = {
  close(): void;
  send?(message: unknown): void;
};

/** The close codes of the server after which the client reconnects at once, with a new ticket. */
const REAUTHENTICATE = 4401;

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

  constructor(
    private readonly _baseClient: BaseClientInterface,
    public readonly basePath: string,
    private readonly _options: RealtimeClientOptions = {}
  ) {
    super(_baseClient);
  }

  /** The state of the connection. */
  public get state(): RealtimeState {
    return this._state;
  }

  /** The ID of the open connection on the server. */
  public get connectionId(): string | undefined {
    return this._connectionId;
  }

  /** The transport the client connects with. */
  public get transport(): 'websocket' | 'sse' {
    const transport = this._options.transport ?? 'auto';
    if (transport !== 'auto') {
      return transport;
    }
    return this.webSocketClass() ? 'websocket' : 'sse';
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

  /** Closes the connection without reconnecting, keeping the subscriptions for the next {@link connect}. */
  public disconnect(): void {
    clearTimeout(this._reconnectTimer);
    const transport = this._transport;
    this._transport = undefined;
    this._connectionId = undefined;
    transport?.close();
    this.rejectPending(requestFailed('Realtime connection closed'));
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
      this.connect().catch((e) => this.fail(id, e));
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

    const ticket = this._options.anonymous ? undefined : await this.ticket();
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
  private async ticket(): Promise<string> {
    const { ticket } = await this.sendRequest(
      'post',
      `${this.basePath}/ticket`
    );
    return ticket;
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
      send: (message) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(message));
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
    const subscriptions = [...this._entries.values()].map(
      ({ id, channel, params, filter }) => ({ id, channel, params, filter })
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

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    return new Promise((resolve, reject) => {
      let welcomed = false;
      let buffer = '';

      const read = async (): Promise<void> => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            let index: number;
            while ((index = buffer.indexOf('\n\n')) >= 0) {
              const block = buffer.slice(0, index);
              buffer = buffer.slice(index + 2);
              const data = block
                .split('\n')
                .filter((line) => line.startsWith('data: '))
                .map((line) => line.slice(6))
                .join('\n');
              const message = data ? parse(data) : undefined;
              if (message?.type === 'welcome') {
                welcomed = true;
                this.opened(message.connectionId);
                resolve();
              }
              if (message) {
                this.handle(message);
              }
            }
          }
        } catch {
          // Aborted, or the connection is lost
        }

        if (this._transport === transport) {
          if (!welcomed) {
            reject(requestFailed('Realtime connection refused'));
          }
          this.lost(1006);
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
      case 'result': {
        const pending = this._pending.get(message.id);
        if (pending) {
          clearTimeout(pending.timer);
          this._pending.delete(message.id);
          pending.resolve(message.result);
        }
        return;
      }
      case 'error': {
        const error = problemError(message.error);
        if (message.id && this._pending.has(message.id)) {
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
    this.setState('open');
  }

  /** @internal */
  private lost(code: number): void {
    this._transport = undefined;
    this._connectionId = undefined;
    this.rejectPending(requestFailed('Realtime connection lost'));

    if (this._options.reconnect === false || this._entries.size === 0) {
      this.setState('idle');
      return;
    }

    this.setState('reconnecting');
    const delay =
      code === REAUTHENTICATE
        ? 0
        : Math.min(
            (this._options.reconnectDelay ?? 500) * 2 ** this._attempts,
            this._options.maxReconnectDelay ?? 30000
          );
    this._attempts++;
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => {
      this.connect().catch((e) => this.report(e));
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
      this.connect().catch((e) => {
        for (const id of this._entries.keys()) {
          this.fail(id, e);
        }
      });
    });
  }

  /** @internal */
  private sendSubscribe(entry: Entry): void {
    this._transport?.send?.({
      type: 'subscribe',
      id: entry.id,
      channel: entry.channel,
      ...(entry.params ? { params: entry.params } : {}),
      ...(entry.filter ? { filter: entry.filter } : {})
    });
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

function requestFailed(message: string): ClientError {
  return new ClientError(message, { status: 0 });
}
