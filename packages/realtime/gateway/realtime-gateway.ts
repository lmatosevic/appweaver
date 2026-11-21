import {
  AuthUser,
  createLogger,
  ErrorCode,
  Events,
  IResourceService,
  isPlainObject,
  LIFECYCLE,
  OnDestroy,
  OnReady,
  PubSub,
  RealtimeError,
  ResourceId,
  SpanKind,
  textToBytes,
  telemetryEnabled,
  uuidv4,
  withSpan
} from '@appweaver/common';
import { injectService, inject, runAs } from '@appweaver/core';
import { context } from '@appweaver/core/internal';
import {
  matchesWhere,
  projectRecord,
  queryFilterWhere,
  resourceAuthService
} from '@appweaver/data';
import { toProblem } from '@appweaver/web';
import { findRealtimeAction } from '../action';
import {
  ChannelMessage,
  findChannel,
  PUBSUB_CHANNEL_PREFIX,
  RESOURCE_CHANNEL_PREFIX
} from '../channel';
import { realtimeConfig } from '../config';
import { findStream, STREAM_CHANNEL_PREFIX } from '../stream/create-stream';
import { InputStream, inputSettings } from '../stream/input-stream';
import { pumpStream } from '../stream/pump';
import { StreamHub } from '../stream/stream-hub';
import { StreamInstance, streamSettings } from '../stream/stream-instance';
import { setStreamProblemFormat } from '../stream/stream-problem';
import { Stream, StreamResource, StreamSink } from '../stream/types';
import {
  Channel,
  RealtimeAction,
  RealtimeActionContext,
  RealtimeClientMessage,
  RealtimeCloseCode,
  ResourceEventMessage,
  SubscriptionRequest
} from '../types';
import { hasAccess } from '../utils/access';
import { loadAuthUser } from '../utils/auth-user';
import { resourceEventActions } from '../utils/resource-events';
import { validatePayload } from '../utils/validate';
import { realtimeMetrics } from '../utils/telemetry';
import { ActionCall } from './action-call';
import { RealtimeConnection } from './connection';
import { ConnectionSink } from './connection-sink';
import { ActiveSubscription } from './subscription';

const logger = createLogger('realtime');

// The streams send the errors as the problem details of the API
setStreamProblemFormat(toProblem);

/** The longest key of a stream a client subscribes to. */
const MAX_STREAM_KEY_LENGTH = 256;

/** The first byte of a binary WebSocket message carrying a chunk of an input. */
const INPUT_FRAME = 1;

/** Milliseconds between the checks of the calls of a draining instance. */
const DRAIN_POLL_INTERVAL = 100;

/** A resource event, as the bridge of the resource events publishes it to the pub/sub. */
type ResourceChannelMessage = ChannelMessage & {
  payload: ResourceEventMessage;
};

const SUBSCRIPTION_ID_PATTERN = /^[\w.:-]{1,64}$/;

/** The pub/sub channel of the changed users, never a channel name (they start with a letter or digit). */
const USERS_CHANNEL = `${PUBSUB_CHANNEL_PREFIX}_users`;

/** A change of a user, closing their connections or loading the user of their connections again. */
type UserMessage = { userId: string; change: 'revoke' | 'refresh' };

/**
 * The realtime connections of the instance: their subscriptions to the channels, the delivery of the messages the
 * pub/sub receives for them, checked against the access of every user, and the actions they call. It publishes the
 * resource events of the models exposing them (`createRoutes({ events })`) to the pub/sub, so the connections of
 * every instance receive them.
 */
export class RealtimeGateway implements OnReady, OnDestroy {
  static [LIFECYCLE] = true;

  /** @internal */
  private readonly _pubsub = inject(PubSub);
  /** @internal */
  private readonly _connections = new Map<string, RealtimeConnection>();
  /** @internal */
  private readonly _channels = new Map<
    string,
    {
      subscription: Promise<string>;
      subscribers: Map<ActiveSubscription, RealtimeConnection>;
    }
  >();
  /** @internal */
  private readonly _counts = new Map<string, number>();
  /** @internal */
  private _sendBufferLimit: [text: string, bytes: number] = ['', 0];
  /** @internal */
  private readonly _timers = new Map<string, NodeJS.Timeout>();
  /** @internal */
  private readonly _rates = new Map<
    string,
    { second: number; count: number }
  >();
  /** @internal */
  private readonly _queues = new Map<string, Promise<void>>();
  /** @internal */
  private readonly _listeners: string[] = [];
  /** @internal */
  private _heartbeat?: NodeJS.Timeout;
  /** @internal */
  private _usersSubscription?: Promise<string>;
  /** @internal */
  private readonly _calls = new Map<string, ActionCall>();
  /** @internal */
  private _draining: boolean = false;

  /** The open connections of the instance. */
  public get connections(): ReadonlyMap<string, RealtimeConnection> {
    return this._connections;
  }

  /** The calls of the actions with a stream or an input running on the instance, over the WebSocket or HTTP. */
  public get calls(): ReadonlyMap<string, ActionCall> {
    return this._calls;
  }

  public async onReady(): Promise<void> {
    this.bridgeResourceEvents();
    await this.watchAuthUsers();
  }

  public async onDestroy(): Promise<void> {
    for (const call of [...this._calls.values()]) {
      call.cancel();
    }
    this.closeAll(RealtimeCloseCode.GoingAway, 'Server shutting down');
    const events = inject(Events, false);
    for (const listenerId of this._listeners.splice(0)) {
      events?.removeResourceEvent(listenerId);
    }
    const users = this._usersSubscription;
    this._usersSubscription = undefined;
    if (users) {
      await this._pubsub.unsubscribe(await users).catch(() => false);
    }
  }

  /**
   * Closes the connections of a user on every instance, with a `reauth` message and the code `4401`, so the client
   * reconnects with a new ticket, refused once the user is logged out or disabled. Done on its own when the user of
   * the auth model logs out, is disabled or deleted.
   *
   * @param {ResourceId} userId - The ID of the user.
   * @return {Promise<void>} Resolves once published.
   */
  public async revoke(userId: ResourceId): Promise<void> {
    await this.publishUser({ userId: String(userId), change: 'revoke' });
  }

  /**
   * Loads the user of the connections of a user again on every instance, so the access checks use the user as it is
   * now, and removes the subscriptions the user has lost the access of, each answered with its error. Done on its own
   * on every other change of the user of the auth model, i.e. other roles.
   *
   * @param {ResourceId} userId - The ID of the user.
   * @return {Promise<void>} Resolves once published.
   */
  public async refresh(userId: ResourceId): Promise<void> {
    await this.publishUser({ userId: String(userId), change: 'refresh' });
  }

  /** Whether the instance is shutting down, refusing the new connections and calls. */
  public get draining(): boolean {
    return this._draining;
  }

  /**
   * Shuts the realtime connections of the instance down without losing the calls running on it, i.e. on a rolling
   * update: the new connections and calls are refused, the clients are told to reconnect to another instance (`1012`),
   * where they resume the streams of their calls relayed from this one, the ones streaming an input kept until it
   * ends, then it waits for the calls to end, at most `realtime.shutdownGracePeriod` milliseconds, and closes the rest.
   *
   * @return {Promise<void>} Resolves once every connection is closed.
   */
  public async drain(): Promise<void> {
    this._draining = true;
    const deadline = Date.now() + realtimeConfig.SHUTDOWN_GRACE_PERIOD;

    for (;;) {
      for (const connection of [...this._connections.values()]) {
        if (!streamsInput(connection)) {
          connection.close(
            RealtimeCloseCode.ServiceRestart,
            'Server restarting'
          );
          void this.release(connection);
        }
      }
      if (this._calls.size === 0 || Date.now() >= deadline) {
        break;
      }
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(DRAIN_POLL_INTERVAL, deadline - Date.now())
        )
      );
    }

    for (const call of [...this._calls.values()]) {
      call.fail(shuttingDown());
    }
    this.closeAll(RealtimeCloseCode.GoingAway, 'Server shutting down');
  }

  /**
   * Opens a connection, sending it the `welcome` message, once the connection limits allow it.
   *
   * @param {RealtimeConnection} connection - The connection.
   * @throws {RealtimeError} `REALTIME_CONNECTION_LIMIT` when the instance or the user has too many connections,
   * `REALTIME_SHUTTING_DOWN` while the instance shuts down.
   */
  public open(connection: RealtimeConnection): void {
    if (this._draining) {
      throw shuttingDown();
    }
    const limits: [count: number, limit: number][] = [
      [this._connections.size, realtimeConfig.MAX_CONNECTIONS],
      [
        this._counts.get(countKey(connection)) ?? 0,
        connection.user
          ? realtimeConfig.MAX_CONNECTIONS_PER_USER
          : realtimeConfig.MAX_ANONYMOUS_CONNECTIONS_PER_IP
      ]
    ];

    const exceeded = limits.find(([count, limit]) => exceeds(count, limit));
    if (exceeded) {
      throw new RealtimeError(
        ErrorCode.RealtimeConnectionLimit,
        'Too many realtime connections',
        { limit: exceeded[1] }
      );
    }

    const key = countKey(connection);
    this._counts.set(key, (this._counts.get(key) ?? 0) + 1);
    this._connections.set(connection.id, connection);
    realtimeMetrics.connections(connection.transport, 1);

    const expiresAt = this.expiresAt(connection);
    if (expiresAt !== null) {
      const timer = setTimeout(
        () => this.expire(connection),
        Math.max(0, expiresAt - Date.now())
      );
      timer.unref();
      this._timers.set(connection.id, timer);
    }

    this.startHeartbeat();

    connection.send({
      type: 'welcome',
      connectionId: connection.id,
      expiresAt: expiresAt === null ? null : new Date(expiresAt).toISOString(),
      heartbeat: realtimeConfig.HEARTBEAT_INTERVAL
    });

    logger.debug(
      {
        connectionId: connection.id,
        transport: connection.transport,
        userId: connection.user?.id
      },
      'Realtime connection opened'
    );
  }

  /**
   * Removes a closed connection with its subscriptions.
   *
   * @param {RealtimeConnection} connection - The connection.
   */
  public async release(connection: RealtimeConnection): Promise<void> {
    if (!this._connections.delete(connection.id)) {
      return;
    }

    connection.closed = true;
    clearTimeout(this._timers.get(connection.id));
    this._timers.delete(connection.id);
    this._rates.delete(connection.id);
    this._queues.delete(connection.id);
    realtimeMetrics.connections(connection.transport, -1);

    const key = countKey(connection);
    const count = (this._counts.get(key) ?? 1) - 1;
    if (count > 0) {
      this._counts.set(key, count);
    } else {
      this._counts.delete(key);
    }

    const subscriptions = [...connection.subscriptions.values()];
    connection.subscriptions.clear();
    await Promise.all(subscriptions.map((s) => this.releaseChannel(s)));

    if (this._connections.size === 0) {
      clearInterval(this._heartbeat);
      this._heartbeat = undefined;
    }

    logger.debug({ connectionId: connection.id }, 'Realtime connection closed');
  }

  /**
   * Subscribes a connection to a channel.
   *
   * @param {RealtimeConnection} connection - The connection.
   * @param {SubscriptionRequest} request - The subscription the client asks for.
   * @throws {RealtimeError} `REALTIME_MESSAGE_INVALID`, `REALTIME_CHANNEL_UNKNOWN`, `REALTIME_SUBSCRIPTION_DENIED`,
   * `REALTIME_SUBSCRIPTION_LIMIT` or `REALTIME_PAYLOAD_INVALID`.
   */
  public async subscribe(
    connection: RealtimeConnection,
    request: SubscriptionRequest
  ): Promise<void> {
    if (
      typeof request?.id !== 'string' ||
      !SUBSCRIPTION_ID_PATTERN.test(request.id) ||
      typeof request.channel !== 'string' ||
      (request.params !== undefined && !isPlainObject(request.params)) ||
      (request.filter !== undefined && !isPlainObject(request.filter))
    ) {
      throw invalidMessage('Invalid realtime subscription');
    }
    this.checkSubscriptionId(connection, request.id);

    let subscription: ActiveSubscription;
    if (request.channel.startsWith(RESOURCE_CHANNEL_PREFIX)) {
      subscription = this.resourceSubscription(connection.user, request);
    } else if (request.channel.startsWith(STREAM_CHANNEL_PREFIX)) {
      subscription = await this.streamSubscription(connection, request);
    } else {
      subscription = await this.channelSubscription(connection.user, request);
    }

    connection.subscriptions.set(request.id, subscription);
    try {
      await this.acquireChannel(connection, subscription);
    } catch (e) {
      connection.subscriptions.delete(request.id);
      throw e;
    }

    logger.debug(
      { connectionId: connection.id, channel: request.channel },
      'Realtime subscription added'
    );
  }

  /**
   * Removes a subscription of a connection.
   *
   * @param {RealtimeConnection} connection - The connection.
   * @param {string} id - The ID of the subscription.
   * @return {Promise<boolean>} `true` if the subscription was found and removed, `false` otherwise.
   */
  public async unsubscribe(
    connection: RealtimeConnection,
    id: string
  ): Promise<boolean> {
    const subscription = connection.subscriptions.get(id);
    if (!subscription) {
      return false;
    }
    connection.subscriptions.delete(id);
    if (subscription.kind === 'action-call') {
      subscription.call.cancel();
      return true;
    }
    if (subscription.kind === 'remote-call') {
      await this.cancelRemoteCall(connection, subscription);
      return true;
    }
    await this.releaseChannel(subscription);
    return true;
  }

  /**
   * Calls an action as a user.
   *
   * @param {string} name - The name of the action.
   * @param {unknown} payload - The payload of the call.
   * @param {RealtimeActionContext} actionContext - The user and the transport of the call.
   * @return {Promise<unknown>} The result of the handler.
   * @throws {RealtimeError} `REALTIME_ACTION_UNKNOWN`, `REALTIME_ACTION_DENIED` or `REALTIME_PAYLOAD_INVALID`, or
   * the error of the handler.
   */
  public async callAction(
    name: string,
    payload: unknown,
    actionContext: RealtimeActionContext
  ): Promise<unknown> {
    const action = this.allowedAction(name, actionContext.user);
    if (action.config.stream || action.config.input) {
      throw invalidMessage(
        `Realtime action '${name}' streams, called with an ID`
      );
    }

    const data = validatePayload(action.config.payload, payload);
    const run = () =>
      runAs(actionContext.user, () =>
        action.config.handler(data, actionContext)
      );

    if (!telemetryEnabled('realtime')) {
      return run();
    }

    return withSpan(
      `realtime action ${name}`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          'appweaver.realtime.action': name,
          'appweaver.realtime.transport': actionContext.transport,
          'appweaver.realtime.ack': actionContext.ack
        }
      },
      run
    );
  }

  /**
   * Calls an action with a stream or an input as a user: the chunks of its handler written to a subscriber as they
   * come, the stream ending with its result, and the chunks the client streams read by the handler. The handler runs
   * once the call is returned, so the caller registers the subscriber first. The call ends at once when the user logs
   * out, is disabled or loses the access of the action.
   *
   * @param {string} name - The name of the action.
   * @param {unknown} payload - The payload of the call.
   * @param {RealtimeActionContext} actionContext - The user and the transport of the call.
   * @param {Object} [options] - The subscriber of the stream, and the receiver of the bytes the client may send again.
   * @return {ActionCall} The call, its `done` settling with the result of an action without a stream.
   * @throws {RealtimeError} `REALTIME_ACTION_UNKNOWN`, `REALTIME_ACTION_DENIED`, `REALTIME_PAYLOAD_INVALID`, or
   * `REALTIME_MESSAGE_INVALID` for an action without a stream or an input, or with an input over HTTP.
   */
  public openActionCall(
    name: string,
    payload: unknown,
    actionContext: RealtimeActionContext,
    options: { sink?: StreamSink; onCredit?: (bytes: number) => void } = {}
  ): ActionCall & { done: Promise<unknown> } {
    const action = this.allowedAction(name, actionContext.user);
    const config = action.config;
    if (this._draining) {
      throw shuttingDown();
    }
    if (!config.stream && !config.input) {
      throw invalidMessage(`Realtime action '${name}' does not stream`);
    }
    if (config.input && actionContext.transport !== 'websocket') {
      throw invalidMessage(
        `Realtime action '${name}' receives an input over the WebSocket only`
      );
    }

    const data = validatePayload(config.payload, payload);
    const user = actionContext.user;
    const output = config.stream
      ? inject(StreamHub).openAction(
          name,
          streamSettings(config.stream),
          user ? String(user.id) : null
        )
      : undefined;
    const input = config.input
      ? new InputStream(inputSettings(config.input), options.onCredit)
      : undefined;
    const call = new ActionCall(action, user, output, input);
    call.connectionId = actionContext.connectionId;

    this._calls.set(call.id, call);
    call.signal.addEventListener(
      'abort',
      () => {
        if (this._calls.get(call.id) === call) {
          this._calls.delete(call.id);
        }
      },
      { once: true }
    );
    if (output && options.sink) {
      output.attach(options.sink);
    }

    const handlerContext: RealtimeActionContext = {
      ...actionContext,
      signal: call.signal,
      ...(input ? { input } : {})
    };
    const run = () =>
      runAs(user, () =>
        output
          ? runActionStream(action, data, handlerContext, output)
          : action.config.handler(data as never, handlerContext as never)
      );

    const done = new Promise<void>((resolve) => queueMicrotask(resolve)).then(
      () =>
        !telemetryEnabled('realtime')
          ? run()
          : withSpan(
              `realtime action ${name}`,
              {
                kind: SpanKind.SERVER,
                attributes: {
                  'appweaver.realtime.action': name,
                  'appweaver.realtime.transport': actionContext.transport,
                  'appweaver.realtime.ack': true,
                  ...(output
                    ? { 'appweaver.realtime.stream.id': output.streamId }
                    : {})
                }
              },
              run
            )
    );
    // A call without a stream ends with its handler
    done
      .then(
        () => !output && call.finish(),
        () => !output && call.finish()
      )
      .catch(() => undefined);

    return Object.assign(call, { done });
  }

  /**
   * Handles a message of a WebSocket client: a subscription, an action, or a ping. An error answers the message when
   * it has an ID, a fire-and-forget action is answered by nothing.
   *
   * @param {RealtimeConnection} connection - The connection.
   * @param {string} data - The message, a JSON object.
   */
  public async handleMessage(
    connection: RealtimeConnection,
    data: string
  ): Promise<void> {
    let message: RealtimeClientMessage | undefined;

    try {
      try {
        message = JSON.parse(data);
      } catch {
        throw invalidMessage('Realtime message is not JSON');
      }
      if (!isPlainObject(message)) {
        message = undefined;
        throw invalidMessage('Realtime message is not an object');
      }

      const current = message;
      if (current.type === 'input' || current.type === 'input.end') {
        // The inputs are paced by their credits, not by the rate limit
        this.receiveInput(connection, current, data.length);
        return;
      }

      this.checkRate(connection);

      if (current.type === 'subscribe' || current.type === 'unsubscribe') {
        // The subscriptions of a connection change in the order of its
        // messages, while its actions run at once
        const queued = (this._queues.get(connection.id) ?? Promise.resolve())
          .catch(() => undefined)
          .then(() => this.dispatchMessage(connection, current));
        this._queues.set(connection.id, queued);
        await queued;
      } else {
        await this.dispatchMessage(connection, current);
      }
    } catch (e) {
      const id = (message as { id?: unknown } | undefined)?.id;

      // A fire-and-forget action is answered by nothing, not even an error
      if (message?.type === 'action' && typeof id !== 'string') {
        logger.debug(
          { err: e, connectionId: connection.id, action: message.action },
          'Realtime fire-and-forget action failed'
        );
        return;
      }

      connection.send({
        type: 'error',
        ...(typeof id === 'string' ? { id } : {}),
        error: toProblem(e)
      });
    }
  }

  /**
   * Handles a binary message of a WebSocket client, a chunk of an input: the byte `1`, the length of the ID of the
   * call, the ID, then the bytes of the chunk.
   *
   * @param {RealtimeConnection} connection - The connection.
   * @param {Uint8Array} data - The message.
   * @return {boolean} `false` for a message breaking the protocol, closing the connection.
   */
  public handleBinary(
    connection: RealtimeConnection,
    data: Uint8Array
  ): boolean {
    const length = data[1] ?? 0;
    if (data[0] !== INPUT_FRAME || data.length < 2 + length || length === 0) {
      return false;
    }
    const id = Buffer.from(data.subarray(2, 2 + length)).toString();
    try {
      this.receiveInput(
        connection,
        { type: 'input', id, data: data.subarray(2 + length) },
        data.length
      );
    } catch (e) {
      // Thrown in the listener of the socket, it would be uncaught
      connection.send({ type: 'error', id, error: toProblem(e) });
    }
    return true;
  }

  /**
   * Closes every connection.
   *
   * @param {RealtimeCloseCode} code - Why the connections are closed.
   * @param {string} reason - The reason, readable by a person.
   */
  public closeAll(code: RealtimeCloseCode, reason: string): void {
    for (const connection of [...this._connections.values()]) {
      connection.close(code, reason);
      void this.release(connection);
    }
  }

  /** @internal */
  private async dispatchMessage(
    connection: RealtimeConnection,
    message: RealtimeClientMessage
  ): Promise<void> {
    switch (message.type) {
      case 'subscribe':
        await this.subscribe(connection, message);
        connection.send({ type: 'subscribed', id: message.id });
        return;
      case 'unsubscribe':
        await this.unsubscribe(connection, message.id);
        connection.send({ type: 'unsubscribed', id: message.id });
        return;
      case 'ping':
        connection.send({
          type: 'pong',
          ...(message.id ? { id: message.id } : {})
        });
        return;
      case 'action': {
        if (typeof message.action !== 'string') {
          throw invalidMessage('Realtime action without a name');
        }
        const config = findRealtimeAction(message.action)?.config;
        if (config?.stream || config?.input) {
          this.startActionCall(connection, message);
          realtimeMetrics.messages('action', true);
          return;
        }
        const ack = typeof message.id === 'string';
        const result = await this.callAction(message.action, message.payload, {
          user: connection.user,
          transport: 'websocket',
          connectionId: connection.id,
          ack
        });
        realtimeMetrics.messages('action', ack);
        if (ack) {
          connection.send({
            type: 'result',
            id: message.id!,
            result: result ?? null
          });
        }
        return;
      }
      case 'cancel': {
        const subscription = connection.subscriptions.get(message.id);
        if (subscription?.kind === 'action-call') {
          subscription.call.cancel();
          // A call without a stream has nothing more to answer
          if (!subscription.call.output) {
            connection.subscriptions.delete(message.id);
          }
        } else if (subscription?.kind === 'remote-call') {
          connection.subscriptions.delete(message.id);
          await this.cancelRemoteCall(connection, subscription);
        }
        return;
      }
      case 'resume':
        await this.resumeActionCall(connection, message);
        return;
      default:
        throw invalidMessage(
          `Unknown realtime message type '${(message as { type?: unknown }).type}'`
        );
    }
  }

  /** @internal */
  private allowedAction(name: string, user: AuthUser | null): RealtimeAction {
    const action = findRealtimeAction(name);
    if (!action) {
      throw new RealtimeError(
        ErrorCode.RealtimeActionUnknown,
        `Unknown realtime action '${name}'`,
        { action: name }
      );
    }
    if (!hasAccess(user, action.config)) {
      throw deniedAction(name);
    }
    return action;
  }

  /** @internal */
  private checkSubscriptionId(
    connection: RealtimeConnection,
    id: unknown
  ): void {
    if (typeof id !== 'string' || !SUBSCRIPTION_ID_PATTERN.test(id)) {
      throw invalidMessage('Invalid realtime subscription ID');
    }
    if (connection.subscriptions.has(id)) {
      throw invalidMessage(`Subscription '${id}' already exists`);
    }
    if (connection.subscriptions.size >= realtimeConfig.MAX_SUBSCRIPTIONS) {
      throw new RealtimeError(
        ErrorCode.RealtimeSubscriptionLimit,
        'Too many realtime subscriptions',
        { limit: realtimeConfig.MAX_SUBSCRIPTIONS }
      );
    }
  }

  /** @internal */
  private startActionCall(
    connection: RealtimeConnection,
    message: { id?: string; action: string; payload?: unknown }
  ): void {
    const id = message.id;
    if (typeof id !== 'string') {
      throw invalidMessage(
        `Realtime action '${message.action}' streams, called with an ID`
      );
    }
    this.checkSubscriptionId(connection, id);

    const sink = this.connectionSink(connection, id, true);
    let credit = 0;
    const call = this.openActionCall(
      message.action,
      message.payload,
      {
        user: connection.user,
        transport: 'websocket',
        connectionId: connection.id,
        ack: true
      },
      {
        sink,
        // The bytes read are given back in halves of the window
        onCredit: (bytes) => {
          credit += bytes;
          if (credit * 2 >= (call.input?.settings.window ?? 0)) {
            connection.send({ type: 'input.credit', id, bytes: credit });
            credit = 0;
          }
        }
      }
    );
    const subscription: ActiveSubscription = {
      kind: 'action-call',
      id,
      channel: `action:${message.action}`,
      params: {},
      call,
      ...(call.output ? { sink } : {})
    };
    connection.subscriptions.set(id, subscription);

    if (call.input) {
      connection.send({
        type: 'input.credit',
        id,
        bytes: call.input.settings.window
      });
    }
    if (call.output) {
      return;
    }

    // An action without a stream answers with its result, or its error
    const answer = (error: unknown, result?: unknown) => {
      if (connection.subscriptions.get(id) !== subscription) {
        return;
      }
      connection.subscriptions.delete(id);
      connection.send(
        error === undefined
          ? { type: 'result', id, result: result ?? null }
          : { type: 'error', id, error: toProblem(error) }
      );
    };
    call.signal.addEventListener('abort', () => {
      if (call.error !== undefined) {
        answer(call.error);
      }
    });
    call.done.then(
      (result) => answer(call.error, result),
      (e) => answer(call.error ?? e)
    );
  }

  /** @internal */
  private receiveInput(
    connection: RealtimeConnection,
    message: { type: 'input' | 'input.end'; id?: unknown; data?: unknown },
    size: number
  ): void {
    const subscription =
      typeof message.id === 'string'
        ? connection.subscriptions.get(message.id)
        : undefined;
    const call =
      subscription?.kind === 'action-call' ? subscription.call : undefined;
    if (!call?.input) {
      // Only the inputs of a call are paced by its credits
      this.checkRate(connection);
      throw invalidMessage('Realtime input of no call receiving one');
    }

    try {
      if (message.type === 'input.end') {
        call.input.end();
      } else {
        call.input.push(message.data, size);
        realtimeMetrics.inputBytes(call.action.name, size);
      }
    } catch (e) {
      call.fail(e);
    }
  }

  /** @internal */
  private async resumeActionCall(
    connection: RealtimeConnection,
    message: { id: string; streamId: unknown; seq: unknown }
  ): Promise<void> {
    if (
      typeof message.streamId !== 'string' ||
      !Number.isInteger(message.seq) ||
      (message.seq as number) < 0
    ) {
      throw invalidMessage('Invalid realtime stream resume');
    }
    this.checkSubscriptionId(connection, message.id);

    const sink = this.connectionSink(connection, message.id, true);
    const user = connection.user;
    // Reserved while the stream of another instance is awaited
    const placeholder: ActiveSubscription = {
      kind: 'remote-call',
      id: message.id,
      channel: 'action:',
      params: {},
      streamId: message.streamId,
      sink
    };
    connection.subscriptions.set(message.id, placeholder);
    let resumed: Awaited<ReturnType<StreamHub['resumeAction']>>;
    try {
      resumed = await inject(StreamHub).resumeAction(
        message.streamId,
        user ? String(user.id) : null,
        sink,
        message.seq as number
      );
    } finally {
      if (connection.subscriptions.get(message.id) === placeholder) {
        connection.subscriptions.delete(message.id);
      }
    }

    const { instance, remote } = resumed;
    if (remote) {
      if (!instance.ended && !connection.closed) {
        connection.subscriptions.set(message.id, {
          ...placeholder,
          channel: `action:${instance.name}`
        });
      } else if (connection.closed) {
        await inject(StreamHub).unsubscribe('$action', instance.streamId, sink);
      }
      return;
    }

    const call = this._calls.get(instance.streamId);
    if (!instance.ended && call) {
      call.connectionId = connection.id;
      connection.subscriptions.set(message.id, {
        kind: 'action-call',
        id: message.id,
        channel: `action:${instance.name}`,
        params: {},
        call,
        sink
      });
    }
  }

  /** @internal */
  private async cancelRemoteCall(
    connection: RealtimeConnection,
    subscription: Extract<ActiveSubscription, { kind: 'remote-call' }>
  ): Promise<void> {
    const hub = inject(StreamHub);
    const user = connection.user;
    await hub.cancelAction(
      subscription.streamId,
      user ? String(user.id) : null
    );
    await hub.unsubscribe('$action', subscription.streamId, subscription.sink);
  }

  /** @internal */
  private connectionSink(
    connection: RealtimeConnection,
    id: string,
    once: boolean
  ): ConnectionSink {
    const sink: ConnectionSink = new ConnectionSink(
      connection,
      id,
      () => {
        logger.warn(
          { connectionId: connection.id },
          'Realtime connection closed as too slow'
        );
        connection.close(RealtimeCloseCode.TooSlow, 'Connection too slow');
        void this.release(connection);
      },
      // The subscription of a streaming action ends with its stream
      once
        ? () => {
            const subscription = connection.subscriptions.get(id);
            if (
              (subscription?.kind === 'action-call' ||
                subscription?.kind === 'remote-call') &&
              subscription.sink === sink
            ) {
              connection.subscriptions.delete(id);
            }
          }
        : undefined
    );
    return sink;
  }

  /** @internal */
  private async streamSubscription(
    connection: RealtimeConnection,
    request: SubscriptionRequest
  ): Promise<ActiveSubscription> {
    const user = connection.user;
    const definition = findStream(
      request.channel.slice(STREAM_CHANNEL_PREFIX.length)
    );
    if (!definition) {
      throw unknownChannel(request.channel);
    }

    const key = request.key ?? '';
    const resume = request.resume;
    if (
      typeof key !== 'string' ||
      key.length > MAX_STREAM_KEY_LENGTH ||
      (resume !== undefined &&
        (!isPlainObject(resume) ||
          typeof resume.streamId !== 'string' ||
          !Number.isInteger(resume.seq) ||
          resume.seq < 0))
    ) {
      throw invalidMessage('Invalid realtime stream subscription');
    }
    if (!hasAccess(user, definition.config)) {
      throw deniedSubscription(request.channel);
    }

    const params = definition.config.params
      ? validatePayload(definition.config.params, request.params ?? {})
      : {};
    if (!(await this.streamAccess(user, definition, params, key))) {
      throw deniedSubscription(request.channel);
    }

    return {
      kind: 'stream',
      id: request.id,
      channel: request.channel,
      params: params as Record<string, unknown>,
      definition,
      key,
      sink: this.connectionSink(connection, request.id, false),
      ...(resume
        ? { resume: { streamId: resume.streamId, seq: resume.seq } }
        : {})
    };
  }

  /** @internal */
  private async streamAccess(
    user: AuthUser | null,
    definition: Stream,
    params: unknown,
    key: string
  ): Promise<boolean> {
    const config = definition.config;
    return (
      hasAccess(user, config) &&
      (!config.resource ||
        (await this.recordAccess(user, config.resource, params, key))) &&
      (!config.subscribe ||
        (await runAs(user, () =>
          config.subscribe!(user, params as never, key)
        )))
    );
  }

  /**
   * Checks whether a user may read the record a key of a stream belongs to: its `find` as the user passes, with the
   * policy of its model (`checkAccess`, `readRestrictions`).
   *
   * @internal
   */
  private async recordAccess(
    user: AuthUser | null,
    resource: StreamResource,
    params: unknown,
    key: string
  ): Promise<boolean> {
    const service = injectService(resource.model as never, false) as
      | IResourceService
      | undefined;
    if (!service) {
      logger.warn(
        { model: resource.model },
        'Realtime stream bound to an unknown model'
      );
      return false;
    }

    const id = resource.id
      ? resource.id(key, params)
      : /^\d+$/.test(key)
        ? Number(key)
        : key;
    try {
      await runAs(user, () => service.find(id));
      return true;
    } catch (e) {
      // Not found, forbidden or an ID of another type all deny
      logger.debug(
        { err: e, model: resource.model, key },
        'Realtime stream record denied'
      );
      return false;
    }
  }

  /** @internal */
  private resourceSubscription(
    user: AuthUser | null,
    request: SubscriptionRequest
  ): ActiveSubscription {
    const [model, action] = request.channel
      .slice(RESOURCE_CHANNEL_PREFIX.length)
      .split('.');
    const allowed = this.allowedActions(user, model, action, request.channel);
    if (allowed.length === 0) {
      throw deniedSubscription(request.channel);
    }

    return {
      kind: 'resource',
      id: request.id,
      channel: request.channel,
      pubsubChannel: `${PUBSUB_CHANNEL_PREFIX}${RESOURCE_CHANNEL_PREFIX}${model}`,
      params: {},
      model,
      action,
      actions: new Set(allowed),
      where: request.filter
        ? queryFilterWhere(request.filter, model)
        : undefined
    };
  }

  /**
   * The exposed actions of a model a user has the access of: the one subscribed to, or every one of the channel of
   * every action.
   *
   * @internal
   */
  private allowedActions(
    user: AuthUser | null,
    model: string,
    action: string | undefined,
    channel: string
  ): string[] {
    const routes = context.resource.routes.get(model)?.config;
    const exposed = routes ? resourceEventActions(routes) : new Map();

    if (
      !context.resource.models.has(model) ||
      exposed.size === 0 ||
      (action !== undefined && !exposed.has(action))
    ) {
      throw unknownChannel(channel);
    }

    return [...exposed]
      .filter(
        ([name, access]) =>
          (action === undefined || name === action) && hasAccess(user, access)
      )
      .map(([name]) => name as string);
  }

  /** @internal */
  private async channelSubscription(
    user: AuthUser | null,
    request: SubscriptionRequest
  ): Promise<ActiveSubscription> {
    const definition = findChannel(request.channel);
    if (!definition) {
      throw unknownChannel(request.channel);
    }

    const config = definition.config;
    if (!hasAccess(user, config)) {
      throw deniedSubscription(request.channel);
    }

    const params = config.params
      ? validatePayload(config.params, request.params ?? {})
      : {};

    if (!(await this.channelAccess(user, definition, params))) {
      throw deniedSubscription(request.channel);
    }

    return {
      kind: 'channel',
      id: request.id,
      channel: request.channel,
      pubsubChannel: PUBSUB_CHANNEL_PREFIX + definition.name,
      params: params as Record<string, unknown>,
      definition
    };
  }

  /** @internal */
  private async channelAccess(
    user: AuthUser | null,
    definition: Channel,
    params: unknown
  ): Promise<boolean> {
    const config = definition.config;
    return (
      hasAccess(user, config) &&
      (!config.subscribe ||
        (await runAs(user, () => config.subscribe!(user, params as never))))
    );
  }

  /** @internal */
  private async acquireChannel(
    connection: RealtimeConnection,
    subscription: ActiveSubscription
  ): Promise<void> {
    if (subscription.kind === 'stream') {
      await inject(StreamHub).subscribe(
        subscription.definition,
        subscription.key,
        subscription.sink,
        subscription.resume
      );
      return;
    }
    if (
      subscription.kind === 'action-call' ||
      subscription.kind === 'remote-call'
    ) {
      return;
    }

    const name = subscription.pubsubChannel;
    let channel = this._channels.get(name);

    if (!channel) {
      channel = {
        subscription: this._pubsub.subscribe<ChannelMessage>(name, (message) =>
          this.deliver(name, message)
        ),
        subscribers: new Map()
      };
      this._channels.set(name, channel);
    }
    channel.subscribers.set(subscription, connection);

    try {
      await channel.subscription;
    } catch (e) {
      channel.subscribers.delete(subscription);
      if (this._channels.get(name) === channel) {
        this._channels.delete(name);
      }
      throw e;
    }
  }

  /** @internal */
  private async releaseChannel(
    subscription: ActiveSubscription
  ): Promise<void> {
    if (subscription.kind === 'stream') {
      await inject(StreamHub).unsubscribe(
        subscription.definition.name,
        subscription.key,
        subscription.sink
      );
      return;
    }
    if (subscription.kind === 'remote-call') {
      // Its owner lingers it for a resume of its caller
      await inject(StreamHub).unsubscribe(
        '$action',
        subscription.streamId,
        subscription.sink
      );
      return;
    }
    if (subscription.kind === 'action-call') {
      const { call, sink } = subscription;
      if (call.input && !call.input.ended) {
        // An input cannot resume, the client has to call again
        call.cancel();
      } else if (call.output && sink) {
        // The stream lingers for a resume of its caller
        call.output.detach(sink);
      }
      return;
    }

    const name = subscription.pubsubChannel;
    const channel = this._channels.get(name);
    if (
      !channel?.subscribers.delete(subscription) ||
      channel.subscribers.size > 0
    ) {
      return;
    }
    this._channels.delete(name);
    try {
      await this._pubsub.unsubscribe(await channel.subscription);
    } catch (e) {
      logger.warn(e, `Realtime channel '${name}' unsubscribe failed`);
    }
  }

  /** @internal */
  private async deliver(
    pubsubChannel: string,
    message: ChannelMessage
  ): Promise<void> {
    const subscribers = this._channels.get(pubsubChannel)?.subscribers;
    if (!subscribers?.size) {
      return;
    }

    // The access of a user to a resource event is checked once per event
    const access = new Map<string, Promise<boolean>>();
    let projected: Record<string, unknown> | undefined;

    await Promise.all(
      [...subscribers].map(async ([subscription, connection]) => {
        let data: unknown;

        try {
          if (subscription.kind === 'resource') {
            const event = (message as ResourceChannelMessage).payload;
            if (
              !subscription.actions.has(event.action) ||
              (subscription.where &&
                matchesWhere(
                  event.current as Record<string, unknown>,
                  subscription.where
                ) !== true)
            ) {
              return;
            }

            const userKey = String(connection.user?.id ?? '');
            if (!access.has(userKey)) {
              access.set(userKey, this.resourceAccess(connection.user, event));
            }
            if (!(await access.get(userKey))) {
              realtimeMetrics.events(subscription.channel, 'denied');
              return;
            }

            projected ??= {
              model: event.model,
              action: event.action,
              current: projectRecord(event.model, event.current),
              ...(event.previous !== undefined
                ? { previous: projectRecord(event.model, event.previous) }
                : {})
            };
            data = projected;
          } else if (subscription.kind === 'channel') {
            const deliverFn = subscription.definition.config.deliver;
            if (
              deliverFn &&
              !(await runAs(connection.user, () =>
                deliverFn(
                  connection.user,
                  message.payload as never,
                  subscription.params as never
                )
              ))
            ) {
              realtimeMetrics.events(subscription.channel, 'denied');
              return;
            }
            data = message.payload;
          } else {
            return;
          }
        } catch (e) {
          logger.error(
            e,
            `Realtime event of the '${subscription.channel}' channel failed`
          );
          return;
        }

        this.send(connection, {
          type: 'event',
          id: subscription.id,
          channel: subscription.channel,
          eventId: message.eventId,
          data
        });
      })
    );
  }

  /** @internal */
  private send(
    connection: RealtimeConnection,
    message: Parameters<RealtimeConnection['send']>[0] & { channel: string }
  ): void {
    if (connection.closed) {
      return;
    }
    if (connection.bufferedAmount() > this.sendBufferLimit()) {
      realtimeMetrics.events(message.channel, 'dropped');
      logger.warn(
        { connectionId: connection.id },
        'Realtime connection closed as too slow'
      );
      connection.close(RealtimeCloseCode.TooSlow, 'Connection too slow');
      void this.release(connection);
      return;
    }
    connection.send(message);
    realtimeMetrics.events(message.channel, 'delivered');
  }

  /** @internal */
  private sendBufferLimit(): number {
    const text = realtimeConfig.SEND_BUFFER_LIMIT;
    if (this._sendBufferLimit[0] !== text) {
      this._sendBufferLimit = [text, textToBytes(text)];
    }
    return this._sendBufferLimit[1];
  }

  /** @internal */
  private async resourceAccess(
    user: AuthUser | null,
    event: ResourceEventMessage
  ): Promise<boolean> {
    const service = injectService(event.model as never, false) as
      | IResourceService
      | undefined;
    if (!service) {
      return false;
    }
    return runAs(user, () =>
      service.checkEventAccess({
        action: event.action,
        current: event.current as never,
        ...(event.previous !== undefined
          ? { previous: event.previous as never }
          : {})
      })
    );
  }

  /** @internal */
  private bridgeResourceEvents(): void {
    const events = inject(Events, false);
    if (!events || this._listeners.length > 0) {
      return;
    }

    for (const [name, routes] of context.resource.routes) {
      const model = String(name);
      const actions = resourceEventActions(routes.config).keys();
      for (const action of actions) {
        const listenerId = events.onResourceEvent(
          model,
          action,
          ({ current, previous }) => {
            const message: ResourceChannelMessage = {
              eventId: uuidv4(),
              payload: {
                model,
                action,
                current,
                ...(previous !== undefined ? { previous } : {})
              }
            };
            this._pubsub
              .publish(
                `${PUBSUB_CHANNEL_PREFIX}${RESOURCE_CHANNEL_PREFIX}${model}`,
                message
              )
              .catch((e) =>
                logger.error(e, `Resource event of '${model}' publish failed`)
              );
          }
        );
        this._listeners.push(listenerId);
      }
    }
  }

  /**
   * Revokes the connections of the users of the auth model who log out, are disabled or deleted, refreshes the ones of
   * the users changed otherwise, and applies the changes every instance publishes to its own connections.
   *
   * @internal
   */
  private async watchAuthUsers(): Promise<void> {
    const events = inject(Events, false);
    const service = resourceAuthService();
    if (!events || !service || this._usersSubscription) {
      return;
    }

    const publish = (
      user: Pick<AuthUser, 'id'>,
      change: UserMessage['change']
    ) =>
      this.publishUser({ userId: String(user.id), change }).catch((e) =>
        logger.error(e, 'Realtime user change publish failed')
      );

    this._listeners.push(
      events.onResourceEvent<AuthUser>(
        service.modelName,
        'update',
        ({ previous, current }) =>
          void publish(
            current,
            previous && endsAccess(previous, current) ? 'revoke' : 'refresh'
          )
      ),
      events.onResourceEvent<AuthUser>(
        service.modelName,
        'delete',
        ({ current }) => void publish(current, 'revoke')
      )
    );

    this._usersSubscription = this._pubsub.subscribe<UserMessage>(
      USERS_CHANNEL,
      (message) => this.applyUserChange(message)
    );
    await this._usersSubscription;
  }

  /** @internal */
  private async publishUser(message: UserMessage): Promise<void> {
    await this._pubsub.publish(USERS_CHANNEL, message);
  }

  /** @internal */
  private async applyUserChange({
    userId,
    change
  }: UserMessage): Promise<void> {
    const connections = [...this._connections.values()].filter(
      (c) => c.user && String(c.user.id) === userId
    );
    const calls = [...this._calls.values()].filter(
      (call) => call.userId === userId
    );
    if (connections.length === 0 && calls.length === 0) {
      return;
    }

    const known = connections[0]?.user ?? calls[0].user!;
    const user = change === 'refresh' ? await loadAuthUser(known.id) : null;
    if (user === undefined) {
      return;
    }
    if (!user || user.enabled === false) {
      // Ended at once, never left to linger for a resume
      calls.forEach((call) => call.fail(deniedAction(call.action.name)));
      connections.forEach((connection) => this.expire(connection));
      return;
    }

    for (const call of calls) {
      call.user = user;
      if (!hasAccess(user, call.action.config)) {
        call.fail(deniedAction(call.action.name));
      }
    }
    for (const connection of connections) {
      connection.auth.user = user;
      await this.recheckSubscriptions(connection);
    }
    logger.debug({ userId }, 'Realtime connections of a user refreshed');
  }

  /**
   * Checks the subscriptions of a connection against the access of its user again, removing the ones the user lost.
   *
   * @internal
   */
  private async recheckSubscriptions(
    connection: RealtimeConnection
  ): Promise<void> {
    for (const subscription of [...connection.subscriptions.values()]) {
      let allowed: boolean;
      try {
        if (subscription.kind === 'resource') {
          const actions = this.allowedActions(
            connection.user,
            subscription.model,
            subscription.action,
            subscription.channel
          );
          subscription.actions = new Set(actions);
          allowed = actions.length > 0;
        } else if (subscription.kind === 'stream') {
          allowed = await this.streamAccess(
            connection.user,
            subscription.definition,
            subscription.params,
            subscription.key
          );
        } else if (
          subscription.kind === 'action-call' ||
          subscription.kind === 'remote-call'
        ) {
          // Checked with the calls of the user by the instance running them
          allowed = true;
        } else {
          allowed = await this.channelAccess(
            connection.user,
            subscription.definition,
            subscription.params
          );
        }
      } catch {
        allowed = false;
      }

      if (!allowed && connection.subscriptions.delete(subscription.id)) {
        await this.releaseChannel(subscription);
        connection.send({
          type: 'error',
          id: subscription.id,
          error: toProblem(deniedSubscription(subscription.channel))
        });
      }
    }
  }

  /** @internal */
  private checkRate(connection: RealtimeConnection): void {
    const limit = realtimeConfig.MESSAGE_RATE_LIMIT;
    if (limit === 0) {
      return;
    }

    const second = Math.floor(Date.now() / 1000);
    const rate = this._rates.get(connection.id);
    if (!rate || rate.second !== second) {
      this._rates.set(connection.id, { second, count: 1 });
      return;
    }
    if (++rate.count > limit) {
      throw new RealtimeError(
        ErrorCode.RealtimeRateLimited,
        'Too many realtime messages',
        { retryAfter: 1 }
      );
    }
  }

  /** @internal */
  private expiresAt(connection: RealtimeConnection): number | null {
    const maxAge = realtimeConfig.CONNECTION_MAX_AGE;
    const limits = [
      connection.auth.expiresAt,
      maxAge > 0 ? connection.openedAt + maxAge : null
    ].filter((limit): limit is number => limit !== null);
    return limits.length > 0 ? Math.min(...limits) : null;
  }

  /** @internal */
  private expire(connection: RealtimeConnection): void {
    connection.send({ type: 'reauth' });
    connection.close(
      RealtimeCloseCode.Reauthenticate,
      'Authentication expired'
    );
    void this.release(connection);
  }

  /** @internal */
  private startHeartbeat(): void {
    if (this._heartbeat) {
      return;
    }
    this._heartbeat = setInterval(() => {
      for (const connection of this._connections.values()) {
        connection.heartbeat();
      }
    }, realtimeConfig.HEARTBEAT_INTERVAL);
    this._heartbeat.unref();
  }
}

/** Whether an update of a user ends the access of their connections: a logout or a disabling. */
function endsAccess(
  previous: Pick<AuthUser, 'enabled' | 'logoutAt'>,
  current: Pick<AuthUser, 'enabled' | 'logoutAt'>
): boolean {
  const time = (date?: Date | string | null) =>
    date ? new Date(date).getTime() : null;
  return (
    (current.enabled === false && previous.enabled !== false) ||
    time(current.logoutAt) !== time(previous.logoutAt)
  );
}

/** The key counting the connections of a user, or the anonymous ones of an IP address. */
function countKey(connection: RealtimeConnection): string {
  return connection.user
    ? `user:${String(connection.user.id)}`
    : `ip:${connection.ip ?? ''}`;
}

function exceeds(count: number, limit: number): boolean {
  return limit > 0 && count >= limit;
}

function invalidMessage(message: string): RealtimeError {
  return new RealtimeError(ErrorCode.RealtimeMessageInvalid, message);
}

function unknownChannel(channel: string): RealtimeError {
  return new RealtimeError(
    ErrorCode.RealtimeChannelUnknown,
    `Unknown realtime channel '${channel}'`,
    { channel }
  );
}

function deniedSubscription(channel: string): RealtimeError {
  return new RealtimeError(
    ErrorCode.RealtimeSubscriptionDenied,
    `Realtime subscription to '${channel}' denied`,
    { channel }
  );
}

/**
 * Runs the handler of a streaming action, writing the chunks of the async iterable it returns to its stream, or
 * ending the stream with the value it returns otherwise.
 */
async function runActionStream(
  action: RealtimeAction,
  data: unknown,
  handlerContext: RealtimeActionContext,
  instance: StreamInstance
): Promise<void> {
  let result: unknown;
  try {
    result = action.config.handler(data, handlerContext);
    if (isAsyncIterable(result)) {
      await pumpStream(instance, result);
      return;
    }
    instance.end((await result) ?? undefined);
  } catch (e) {
    instance.error(e);
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    !!value &&
    typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
      'function'
  );
}

function deniedAction(action: string): RealtimeError {
  return new RealtimeError(
    ErrorCode.RealtimeActionDenied,
    `Realtime action '${action}' denied`,
    { action }
  );
}

/** Whether a connection streams the input of a call, which cannot move to another instance. */
function streamsInput(connection: RealtimeConnection): boolean {
  for (const subscription of connection.subscriptions.values()) {
    if (
      subscription.kind === 'action-call' &&
      subscription.call.input &&
      !subscription.call.input.ended
    ) {
      return true;
    }
  }
  return false;
}

function shuttingDown(): RealtimeError {
  return new RealtimeError(
    ErrorCode.RealtimeShuttingDown,
    'Realtime server shutting down'
  );
}
