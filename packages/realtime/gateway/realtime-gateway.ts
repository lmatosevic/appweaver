import {
  ActionType,
  AuthUser,
  createLogger,
  ErrorCode,
  Events,
  IResourceService,
  isPlainObject,
  LIFECYCLE,
  OnDestroy,
  OnReady,
  OnShutdown,
  PubSub,
  RealtimeError,
  SpanKind,
  textToBytes,
  telemetryEnabled,
  uuid,
  withSpan
} from '@appweaver/common';
import { injectService, inject, runAs } from '@appweaver/core';
import { context } from '@appweaver/core/internal';
import { queryFilterWhere, matchesWhere } from '@appweaver/data';
import { toProblem } from '@appweaver/web';
import { findRealtimeAction } from '../action';
import {
  ChannelMessage,
  findChannel,
  PUBSUB_CHANNEL_PREFIX,
  RESOURCE_CHANNEL_PREFIX
} from '../channel';
import { realtimeConfig } from '../config';
import {
  RealtimeActionContext,
  RealtimeClientMessage,
  RealtimeCloseCode,
  ResourceEventMessage,
  SubscriptionRequest
} from '../types';
import { hasAccess } from '../utils/access';
import { projectRecord } from '../utils/project-record';
import { resourceEventActions } from '../utils/resource-events';
import { validatePayload } from '../utils/validate';
import { realtimeMetrics } from '../utils/telemetry';
import { RealtimeConnection } from './connection';
import { ActiveSubscription } from './subscription';

const logger = createLogger('realtime');

/** A resource event, as the bridge of the resource events publishes it to the pub/sub. */
type ResourceChannelMessage = ChannelMessage & {
  payload: ResourceEventMessage;
};

const SUBSCRIPTION_ID_PATTERN = /^[\w.:-]{1,64}$/;

/**
 * The realtime connections of the instance: their subscriptions to the channels, the delivery of the messages the
 * pub/sub receives for them, checked against the access of every user, and the actions they call. It publishes the
 * resource events of the models exposing them (`createRoutes({ events })`) to the pub/sub, so the connections of
 * every instance receive them.
 */
export class RealtimeGateway implements OnReady, OnShutdown, OnDestroy {
  static [LIFECYCLE] = true;

  /** @internal */
  private readonly _pubsub = inject(PubSub);
  /** @internal */
  private readonly _connections = new Map<string, RealtimeConnection>();
  /** @internal */
  private readonly _channels = new Map<
    string,
    { subscription: Promise<string>; count: number }
  >();
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

  /** The open connections of the instance. */
  public get connections(): ReadonlyMap<string, RealtimeConnection> {
    return this._connections;
  }

  public async onReady(): Promise<void> {
    this.bridgeResourceEvents();
  }

  public async onShutdown(): Promise<void> {
    this.closeAll(RealtimeCloseCode.GoingAway, 'Server shutting down');
  }

  public async onDestroy(): Promise<void> {
    this.closeAll(RealtimeCloseCode.GoingAway, 'Server shutting down');
    const events = inject(Events, false);
    for (const listenerId of this._listeners.splice(0)) {
      events?.removeResourceEvent(listenerId);
    }
  }

  /**
   * Opens a connection, sending it the `welcome` message, once the connection limits allow it.
   *
   * @param {RealtimeConnection} connection - The connection.
   * @throws {RealtimeError} `REALTIME_CONNECTION_LIMIT` when the instance or the user has too many connections.
   */
  public open(connection: RealtimeConnection): void {
    const others = [...this._connections.values()];
    const limits: [count: number, limit: number][] = [
      [others.length, realtimeConfig.MAX_CONNECTIONS],
      connection.user
        ? [
            others.filter(
              (c) => c.user && String(c.user.id) === String(connection.user!.id)
            ).length,
            realtimeConfig.MAX_CONNECTIONS_PER_USER
          ]
        : [
            others.filter((c) => !c.user && c.ip === connection.ip).length,
            realtimeConfig.MAX_ANONYMOUS_CONNECTIONS_PER_IP
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

    const subscriptions = [...connection.subscriptions.values()];
    connection.subscriptions.clear();
    await Promise.all(
      subscriptions.map((s) => this.releaseChannel(s.pubsubChannel))
    );

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
    if (connection.subscriptions.has(request.id)) {
      throw invalidMessage(`Subscription '${request.id}' already exists`);
    }
    if (connection.subscriptions.size >= realtimeConfig.MAX_SUBSCRIPTIONS) {
      throw new RealtimeError(
        ErrorCode.RealtimeSubscriptionLimit,
        'Too many realtime subscriptions',
        { limit: realtimeConfig.MAX_SUBSCRIPTIONS }
      );
    }

    const subscription = request.channel.startsWith(RESOURCE_CHANNEL_PREFIX)
      ? this.resourceSubscription(connection.user, request)
      : await this.channelSubscription(connection.user, request);

    connection.subscriptions.set(request.id, subscription);
    try {
      await this.acquireChannel(subscription.pubsubChannel);
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
    await this.releaseChannel(subscription.pubsubChannel);
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
    const action = findRealtimeAction(name);
    if (!action) {
      throw new RealtimeError(
        ErrorCode.RealtimeActionUnknown,
        `Unknown realtime action '${name}'`,
        { action: name }
      );
    }
    if (!hasAccess(actionContext.user, action.config)) {
      throw new RealtimeError(
        ErrorCode.RealtimeActionDenied,
        `Realtime action '${name}' denied`,
        { action: name }
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

      this.checkRate(connection);

      const current = message;
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
      default:
        throw invalidMessage(
          `Unknown realtime message type '${(message as { type?: unknown }).type}'`
        );
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
    const events = context.resource.routes.get(model)?.config.events;
    const exposed = events ? resourceEventActions(events) : new Map();

    if (
      !context.resource.models.has(model) ||
      exposed.size === 0 ||
      (action !== undefined && !exposed.has(action))
    ) {
      throw unknownChannel(request.channel);
    }

    // The channel of every action receives the actions the user may receive
    const allowed = [...exposed]
      .filter(
        ([name, access]) =>
          (action === undefined || name === action) && hasAccess(user, access)
      )
      .map(([name]) => name as string);
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
      actions: new Set(allowed),
      where: request.filter
        ? queryFilterWhere(request.filter, model)
        : undefined
    };
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

    if (
      config.subscribe &&
      !(await runAs(user, () => config.subscribe!(user, params as never)))
    ) {
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
  private async acquireChannel(pubsubChannel: string): Promise<void> {
    const channel = this._channels.get(pubsubChannel);
    if (channel) {
      channel.count++;
      await channel.subscription;
      return;
    }

    const subscription = this._pubsub.subscribe<ChannelMessage>(
      pubsubChannel,
      (message) => this.deliver(pubsubChannel, message)
    );
    this._channels.set(pubsubChannel, { subscription, count: 1 });

    try {
      await subscription;
    } catch (e) {
      this._channels.delete(pubsubChannel);
      throw e;
    }
  }

  /** @internal */
  private async releaseChannel(pubsubChannel: string): Promise<void> {
    const channel = this._channels.get(pubsubChannel);
    if (!channel || --channel.count > 0) {
      return;
    }
    this._channels.delete(pubsubChannel);
    try {
      await this._pubsub.unsubscribe(await channel.subscription);
    } catch (e) {
      logger.warn(e, `Realtime channel '${pubsubChannel}' unsubscribe failed`);
    }
  }

  /** @internal */
  private async deliver(
    pubsubChannel: string,
    message: ChannelMessage
  ): Promise<void> {
    const targets: [RealtimeConnection, ActiveSubscription][] = [];
    for (const connection of this._connections.values()) {
      for (const subscription of connection.subscriptions.values()) {
        if (subscription.pubsubChannel === pubsubChannel) {
          targets.push([connection, subscription]);
        }
      }
    }
    if (targets.length === 0) {
      return;
    }

    // The access of a user to a resource event is checked once per event
    const access = new Map<string, Promise<boolean>>();
    let projected: Record<string, unknown> | undefined;

    await Promise.all(
      targets.map(async ([connection, subscription]) => {
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
          } else {
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
    if (
      connection.bufferedAmount() >
      textToBytes(realtimeConfig.SEND_BUFFER_LIMIT)
    ) {
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
      const actions = routes.config.events
        ? resourceEventActions(routes.config.events).keys()
        : [];
      for (const action of actions) {
        const listenerId = events.onResourceEvent(
          model,
          action,
          ({ current, previous }) => {
            const message: ResourceChannelMessage = {
              eventId: uuid(),
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
