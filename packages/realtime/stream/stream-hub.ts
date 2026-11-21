import {
  createLogger,
  ErrorCode,
  failSpan,
  LIFECYCLE,
  OnDestroy,
  OnReady,
  PubSub,
  RealtimeError,
  Span,
  SpanKind,
  startSpan,
  telemetryEnabled,
  textToBytes,
  uuidv4
} from '@appweaver/common';
import { inject } from '@appweaver/core';
import { realtimeConfig } from '../config';
import { realtimeMetrics } from '../utils/telemetry';
import {
  RingEntry,
  StreamInstance,
  StreamSettings,
  streamSettings
} from './stream-instance';
import { Stream, StreamFrameMessage, StreamSink, StreamWriter } from './types';

const logger = createLogger('realtime');

/** The prefix of the pub/sub channels of the realtime messages, the one of the channels. */
const PUBSUB_CHANNEL_PREFIX = 'realtime:';

/** The pub/sub channel of the interest of the instances in the streams, never a channel name. */
const CONTROL_CHANNEL = `${PUBSUB_CHANNEL_PREFIX}_streams`;

/** The heartbeats a relayed stream may stay silent for before it is lost, and an interest forgotten. */
const MISSED_HEARTBEATS = 3;

/** The name of the topics of the streaming actions, keyed by their stream IDs, never the name of a stream. */
const ACTION_TOPIC = '$action';

/** The milliseconds a resume waits at most for the owner of a streaming action on another instance. */
const MAX_REMOTE_RESUME_WAIT = 2000;

/** The end of a stream, as it is relayed. */
type RelayEnd = Extract<
  StreamFrameMessage,
  { type: 'stream.end' | 'stream.error' }
>;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** A message of the owner of a stream to the instances with a subscriber of its key. */
export type RelayMessage = {
  /** The ID of the instance of the owner */
  from: string;
  /** The ID of the stream */
  streamId: string;
  /** The start of the stream, sent to an instance becoming interested, creating its mirror */
  start?: {
    codec: StreamSettings['codec'];
    mimeType?: string;
    seq: number;
    /** The ID of the user calling a streaming action, the only one who may resume it */
    owner?: string | null;
  };
  /** The chunks, as `[seq, data, sync]` */
  chunks: [number, unknown, true?][];
  /** The end of the stream, without its `sid` */
  end?: DistributiveOmit<RelayEnd, 'sid'>;
};

/** A message of the control channel: the instances with a subscriber of the keys of streams, an instance starting
 * asking for them, or the cancellation of a streaming action resumed on another instance. */
export type ControlMessage = {
  op: 'interest' | 'interest-end' | 'query' | 'cancel';
  from: string;
  topics: [name: string, key: string][];
  /** The user cancelling a streaming action */
  owner?: string | null;
};

/** The subscription of a sink to the key of a stream, resuming one of its streams. */
type SinkResume = { streamId: string; seq: number };

/** The subscribers and the streams of a key of a stream on this instance. */
type Topic = {
  name: string;
  key: string;
  settings: StreamSettings;
  channel: string;
  sinks: Map<StreamSink, SinkResume | undefined>;
  instances: Map<string, { instance: StreamInstance; owned: boolean }>;
  relay?: Promise<string>;
  /** The owner of the mirror of a streaming action */
  owner?: string | null;
  /** Called once a mirror arrives, by the resumes waiting for it */
  waiters?: Set<() => void>;
};

/** The relay of a stream to the other instances. */
type RelayState = {
  chunks: [number, unknown, true?][];
  bytes: number;
  timer?: NodeJS.Timeout;
  lastSent: number;
};

/** A streaming action, its owner and whether it lingers without a subscriber. */
type ActionStream = {
  instance: StreamInstance;
  owner: string | null;
  linger?: NodeJS.Timeout;
};

/**
 * The streams of this instance: the ones its producers write to, the mirrors of the ones of other instances, and the
 * streaming actions. A stream reaches the subscribers of this instance directly, and the other instances only while
 * one of them announces a subscriber of its key, in batches of `realtime.streamRelayFlushInterval` over the pub/sub.
 * It never imports the transports: a subscriber is a {@link StreamSink}.
 */
export class StreamHub implements OnReady, OnDestroy {
  static [LIFECYCLE] = true;

  /** The ID of this instance in the relay */
  public readonly instanceId: string = uuidv4();

  /** @internal */
  private readonly _pubsub = inject(PubSub);
  /** @internal */
  private readonly _topics = new Map<string, Topic>();
  /** @internal */
  private readonly _interest = new Map<string, Map<string, number>>();
  /** @internal */
  private readonly _relays = new Map<StreamInstance, RelayState>();
  /** @internal */
  private readonly _actions = new Map<string, ActionStream>();
  /** @internal */
  private readonly _spans = new Map<StreamInstance, Span>();
  /** @internal */
  private readonly _traced = new Set<StreamInstance>();
  /** @internal */
  private readonly _timers = new Set<NodeJS.Timeout>();
  /** @internal */
  private _sid: number = 0;
  /** @internal */
  private _control?: Promise<string>;
  /** @internal */
  private _heartbeat?: NodeJS.Timeout;
  /** @internal */
  private _destroyed: boolean = false;

  public async onReady(): Promise<void> {
    await this.listen();
  }

  public async onDestroy(): Promise<void> {
    this._destroyed = true;
    clearInterval(this._heartbeat);
    this._heartbeat = undefined;

    const shutdown = new RealtimeError(
      ErrorCode.RealtimeStreamLost,
      'Server shutting down',
      { stream: '' }
    );
    for (const topic of this._topics.values()) {
      for (const { instance, owned } of topic.instances.values()) {
        if (owned) {
          instance.error(shutdown);
        }
      }
    }
    for (const { instance } of this._actions.values()) {
      instance.error(shutdown);
    }

    const topics = [...this._topics.values()].filter((t) => t.sinks.size > 0);
    if (topics.length > 0) {
      await this.publishControl('interest-end', topics);
    }
    for (const topic of this._topics.values()) {
      await this.closeRelay(topic);
    }
    this._topics.clear();
    this._actions.clear();
    this._relays.forEach((relay) => clearTimeout(relay.timer));
    this._relays.clear();
    this._timers.forEach((timer) => clearTimeout(timer));
    this._timers.clear();

    const control = this._control;
    this._control = undefined;
    if (control) {
      await this._pubsub.unsubscribe(await control).catch(() => false);
    }
  }

  /**
   * Opens a stream for a key, attaching the subscribers of the key on this instance, and the other instances
   * interested in it through the relay.
   *
   * @param {Stream} stream - The stream.
   * @param {string} key - The key.
   * @return {StreamWriter} The writer of the stream.
   */
  public open(stream: Stream, key: string): StreamWriter {
    const topic = this.topic(stream, key);
    const instance = new StreamInstance(
      ++this._sid,
      uuidv4(),
      stream.name,
      key,
      topic.settings,
      {
        onChunk: (owner, entry) => this.relayChunk(topic, owner, entry),
        onEnd: (owner, entry) => this.ended(topic, owner, entry)
      }
    );
    topic.instances.set(instance.streamId, { instance, owned: true });
    this.trace(instance);
    this.startHeartbeat();
    void this.listen();

    for (const [sink, resume] of topic.sinks) {
      instance.attach(sink, resumeSeq(resume, instance));
    }
    if (this.remoteInterest(topic) > 0) {
      this.sendSnapshot(topic, instance);
    }

    return this.writer(instance, topic);
  }

  /**
   * Opens the stream of a streaming action, reaching only the subscribers the gateway attaches: its caller, and its
   * caller resuming it on another instance, i.e. one the client moved to while this one shuts down.
   *
   * @param {string} name - The name of the action.
   * @param {StreamSettings} settings - The settings of the stream.
   * @param {string | null} owner - The ID of the user calling the action, null when anonymous.
   * @return {StreamInstance} The stream.
   */
  public openAction(
    name: string,
    settings: StreamSettings,
    owner: string | null
  ): StreamInstance {
    const streamId = uuidv4();
    const topic = this.topicFor(ACTION_TOPIC, streamId, settings);
    const instance = new StreamInstance(
      ++this._sid,
      streamId,
      name,
      streamId,
      settings,
      {
        onChunk: (owned, entry) => this.relayChunk(topic, owned, entry),
        onEmpty: (empty) => this.lingerAction(empty),
        onEnd: (ended, entry) => {
          const action = this._actions.get(ended.streamId);
          clearTimeout(action?.linger);
          this.ended(topic, ended, entry);
          this.later(() => this._actions.delete(ended.streamId));
        }
      }
    );
    topic.instances.set(streamId, { instance, owned: true });
    this._actions.set(streamId, { instance, owner });
    this.startHeartbeat();
    void this.listen();
    return instance;
  }

  /**
   * Attaches a subscriber to the stream of a streaming action again, i.e. after a reconnection, resuming from a
   * sequence number. A stream of another instance, i.e. one shutting down whose clients moved here, is relayed from
   * its owner once it answers.
   *
   * @param {string} streamId - The ID of the stream.
   * @param {string | null} owner - The ID of the user, the one who called the action.
   * @param {StreamSink} sink - The subscriber.
   * @param {number} seq - The sequence number to resume from.
   * @return {Promise<Object>} The stream, and whether it is relayed from another instance.
   * @throws {RealtimeError} `REALTIME_STREAM_NOT_FOUND` for a stream gone, or of another user.
   */
  public async resumeAction(
    streamId: string,
    owner: string | null,
    sink: StreamSink,
    seq: number
  ): Promise<{ instance: StreamInstance; remote: boolean }> {
    const action = this._actions.get(streamId);
    if (action) {
      if (action.owner !== owner) {
        throw streamNotFound(streamId);
      }
      clearTimeout(action.linger);
      action.linger = undefined;
      action.instance.attach(sink, seq);
      return { instance: action.instance, remote: false };
    }

    const topic = this.topicFor(ACTION_TOPIC, streamId, streamSettings());
    let mirror = topic.instances.get(streamId)?.instance;
    if (!mirror) {
      let timer: NodeJS.Timeout | undefined;
      let waiter: (() => void) | undefined;
      const arrived = new Promise<void>((resolve) => {
        waiter = resolve;
        timer = setTimeout(
          resolve,
          Math.min(
            realtimeConfig.STREAM_RELAY_HEARTBEAT,
            MAX_REMOTE_RESUME_WAIT
          )
        );
      });
      (topic.waiters ??= new Set()).add(waiter!);
      try {
        await this.watch(topic);
        await arrived;
      } finally {
        clearTimeout(timer);
        topic.waiters.delete(waiter!);
      }
      mirror = topic.instances.get(streamId)?.instance;
    }

    if (!mirror || topic.owner !== owner) {
      if (topic.sinks.size === 0) {
        await this.release(topic);
      }
      throw streamNotFound(streamId);
    }
    topic.sinks.set(sink, { streamId, seq });
    mirror.attach(sink, seq);
    return { instance: mirror, remote: true };
  }

  /**
   * Cancels a streaming action of a user, on this instance or on the one owning it.
   *
   * @param {string} streamId - The ID of the stream.
   * @param {string | null} owner - The ID of the user, the one who called the action.
   * @return {Promise<void>} Resolves once cancelled, or the cancellation published.
   */
  public async cancelAction(
    streamId: string,
    owner: string | null
  ): Promise<void> {
    const action = this._actions.get(streamId);
    if (action) {
      if (action.owner === owner) {
        action.instance.cancel();
      }
      return;
    }
    await this.publishControl(
      'cancel',
      [{ name: ACTION_TOPIC, key: streamId }],
      owner
    );
  }

  /**
   * Subscribes a sink to the streams of a key: the ones open on this instance at once, and the ones of the other
   * instances once their owners relay them, the interest of this instance announced to them.
   *
   * @param {Stream} stream - The stream.
   * @param {string} key - The key.
   * @param {StreamSink} sink - The subscriber.
   * @param {SinkResume} [resume] - The stream to resume, and the sequence number to resume it from.
   * @return {Promise<void>} Resolves once subscribed to the relay of the key.
   */
  public async subscribe(
    stream: Stream,
    key: string,
    sink: StreamSink,
    resume?: SinkResume
  ): Promise<void> {
    const topic = this.topic(stream, key);
    topic.sinks.set(sink, resume);

    for (const { instance } of topic.instances.values()) {
      if (!instance.ended || resume?.streamId === instance.streamId) {
        instance.attach(sink, resumeSeq(resume, instance));
      }
    }

    try {
      await this.watch(topic);
    } catch (e) {
      await this.unsubscribe(stream.name, key, sink);
      throw e;
    }
  }

  /**
   * Unsubscribes a sink from the streams of a key, without telling it anything.
   *
   * @param {string} name - The name of the stream.
   * @param {string} key - The key.
   * @param {StreamSink} sink - The subscriber.
   * @return {Promise<void>} Resolves once unsubscribed from the relay when it was the last subscriber.
   */
  public async unsubscribe(
    name: string,
    key: string,
    sink: StreamSink
  ): Promise<void> {
    const topic = this._topics.get(topicKey(name, key));
    if (!topic?.sinks.delete(sink)) {
      return;
    }
    for (const { instance } of topic.instances.values()) {
      instance.detach(sink);
    }
    if (topic.sinks.size > 0) {
      return;
    }

    await this.release(topic);
  }

  /**
   * The number of other instances with a subscriber of the key of a stream.
   *
   * @param {string} name - The name of the stream.
   * @param {string} key - The key.
   * @return {number} The number of instances.
   */
  public interestedInstances(name: string, key: string): number {
    return this.remoteInterest(topicKey(name, key));
  }

  /**
   * Handles a message of the control channel, sending the streams of a key to an instance announcing its interest.
   *
   * @param {ControlMessage} message - The message.
   */
  public receiveControl(message: ControlMessage): void {
    if (message.from === this.instanceId || !Array.isArray(message.topics)) {
      return;
    }
    if (message.op === 'query') {
      const subscribed = [...this._topics.values()].filter((t) => t.relay);
      if (subscribed.length > 0) {
        void this.publishControl('interest', subscribed);
      }
      return;
    }

    for (const [name, key] of message.topics) {
      const id = topicKey(name, key);
      if (message.op === 'cancel') {
        const action = name === ACTION_TOPIC ? this._actions.get(key) : null;
        if (action && action.owner === (message.owner ?? null)) {
          action.instance.cancel();
        }
        continue;
      }
      if (message.op === 'interest-end') {
        this._interest.get(id)?.delete(message.from);
        this.relingerAction(name, key);
        continue;
      }

      let instances = this._interest.get(id);
      if (!instances) {
        instances = new Map();
        this._interest.set(id, instances);
      }
      const known = instances.has(message.from);
      instances.set(message.from, Date.now());

      // An ended streaming action is still sent, with its end, for a resume
      const topic = this._topics.get(id);
      if (!known && topic) {
        for (const { instance, owned } of topic.instances.values()) {
          if (owned && (!instance.ended || name === ACTION_TOPIC)) {
            this.sendSnapshot(topic, instance);
          }
        }
      }
    }
  }

  /**
   * Sends the heartbeats of the relay: the interest of this instance in its keys, the liveness of the relayed
   * streams, and loses the mirrors whose owner went silent.
   */
  public heartbeat(): void {
    const now = Date.now();
    const interval = realtimeConfig.STREAM_RELAY_HEARTBEAT;
    const timeout = interval * MISSED_HEARTBEATS;

    const subscribed = [...this._topics.values()].filter((t) => t.relay);
    if (subscribed.length > 0) {
      void this.publishControl('interest', subscribed);
    }

    for (const topic of this._topics.values()) {
      for (const { instance, owned } of topic.instances.values()) {
        if (instance.ended) {
          continue;
        }
        if (!owned && now - instance.lastSeen > timeout) {
          instance.error(
            new RealtimeError(
              ErrorCode.RealtimeStreamLost,
              `Realtime stream '${topic.name}' lost`,
              { stream: topic.name }
            )
          );
        } else if (owned && this.remoteInterest(topic) > 0) {
          const relay = this._relays.get(instance);
          if (!relay || now - relay.lastSent >= interval) {
            this.flushRelay(topic, instance);
          }
        }
      }
    }

    for (const [id, instances] of this._interest) {
      for (const [from, seen] of instances) {
        if (now - seen > timeout) {
          instances.delete(from);
        }
      }
      if (instances.size === 0) {
        this._interest.delete(id);
        const [name, key] = splitTopicKey(id);
        this.relingerAction(name, key);
      }
    }
  }

  /** @internal */
  private async listen(): Promise<void> {
    if (this._destroyed) {
      return;
    }
    try {
      if (this._control) {
        await this._control;
        return;
      }
      this._control = this._pubsub.subscribe<ControlMessage>(
        CONTROL_CHANNEL,
        (message) => this.receiveControl(message)
      );
      await this._control;
      // The instances answer with the keys they have subscribers of
      await this.publishControl('query', []);
    } catch (e) {
      this._control = undefined;
      logger.error(e, 'Realtime stream relay subscription failed');
    }
  }

  /** @internal */
  private writer(instance: StreamInstance, topic: Topic): StreamWriter {
    const remoteInterest = () => this.remoteInterest(topic);
    return {
      name: instance.name,
      key: instance.key,
      streamId: instance.streamId,
      signal: instance.signal,
      get subscribers() {
        return instance.sinks.size + remoteInterest();
      },
      get ended() {
        return instance.ended;
      },
      get ready() {
        return instance.ready;
      },
      write: (chunk, options) => instance.write(chunk, options),
      end: (result) => instance.end(result),
      error: (error) => instance.error(error)
    };
  }

  /** @internal */
  private topic(stream: Stream, key: string): Topic {
    return this.topicFor(stream.name, key, streamSettings(stream.config));
  }

  /** @internal */
  private topicFor(name: string, key: string, settings: StreamSettings): Topic {
    const id = topicKey(name, key);
    let topic = this._topics.get(id);
    if (!topic) {
      topic = {
        name,
        key,
        settings,
        channel: `${PUBSUB_CHANNEL_PREFIX}stream:${name}#${key}`,
        sinks: new Map(),
        instances: new Map()
      };
      this._topics.set(id, topic);
    }
    return topic;
  }

  /**
   * Subscribes to the relay of a topic and announces the interest of this instance in it.
   *
   * @internal
   */
  private async watch(topic: Topic): Promise<void> {
    if (!topic.relay) {
      topic.relay = this._pubsub.subscribe<RelayMessage>(
        topic.channel,
        (message) => this.receive(topic, message)
      );
      this.startHeartbeat();
      void this.publishControl('interest', [topic]);
    }
    await topic.relay;
  }

  /**
   * Drops the mirrors of a topic without a subscriber, ending its relay and the interest of this instance in it.
   *
   * @internal
   */
  private async release(topic: Topic): Promise<void> {
    // The mirrors serve only the subscribers of this instance
    for (const [streamId, { owned }] of topic.instances) {
      if (!owned) {
        topic.instances.delete(streamId);
      }
    }
    if (topic.relay) {
      await this.closeRelay(topic);
      await this.publishControl('interest-end', [topic]);
    }
    this.dropTopic(topic);
  }

  /** @internal */
  private dropTopic(topic: Topic): void {
    const id = topicKey(topic.name, topic.key);
    if (
      topic.sinks.size === 0 &&
      topic.instances.size === 0 &&
      this._topics.get(id) === topic
    ) {
      this._topics.delete(id);
    }
  }

  /** @internal */
  private async closeRelay(topic: Topic): Promise<void> {
    const relay = topic.relay;
    topic.relay = undefined;
    if (!relay) {
      return;
    }
    try {
      await this._pubsub.unsubscribe(await relay);
    } catch (e) {
      logger.warn(e, `Realtime stream '${topic.name}' unsubscribe failed`);
    }
  }

  /** @internal */
  private receive(topic: Topic, message: RelayMessage): void {
    if (
      message.from === this.instanceId ||
      (topic.sinks.size === 0 && !topic.waiters?.size)
    ) {
      return;
    }

    let mirror = topic.instances.get(message.streamId)?.instance;
    if (!mirror) {
      if (!message.start) {
        return;
      }
      mirror = new StreamInstance(
        ++this._sid,
        message.streamId,
        topic.name,
        topic.key,
        {
          ...topic.settings,
          codec: message.start.codec,
          ...(message.start.mimeType
            ? { mimeType: message.start.mimeType }
            : {}),
          coalesce: 0
        },
        { onEnd: (ended) => this.ended(topic, ended) },
        message.start.seq
      );
      topic.instances.set(message.streamId, {
        instance: mirror,
        owned: false
      });
      if (message.start.owner !== undefined) {
        topic.owner = message.start.owner;
      }
      for (const [seq, data, sync] of message.chunks ?? []) {
        mirror.ingest(seq, data, sync);
      }
      for (const [sink, resume] of topic.sinks) {
        mirror.attach(sink, resumeSeq(resume, mirror));
      }
      if (message.end) {
        mirror.finishMirror(message.end);
      }
      topic.waiters?.forEach((waiter) => waiter());
      return;
    } else {
      mirror.lastSeen = Date.now();
      for (const [seq, data, sync] of message.chunks ?? []) {
        mirror.ingest(seq, data, sync);
      }
    }

    if (message.end) {
      mirror.finishMirror(message.end);
    }
  }

  /** @internal */
  private relayChunk(
    topic: Topic,
    instance: StreamInstance,
    entry: RingEntry
  ): void {
    if (this.remoteInterest(topic) === 0) {
      return;
    }

    const relay = this.relayState(instance);
    relay.chunks.push(
      entry.sync ? [entry.seq, entry.data, true] : [entry.seq, entry.data]
    );
    relay.bytes += entry.bytes;

    const interval = realtimeConfig.STREAM_RELAY_FLUSH_INTERVAL;
    if (
      interval === 0 ||
      relay.bytes >= textToBytes(realtimeConfig.STREAM_RELAY_MAX_BATCH)
    ) {
      this.flushRelay(topic, instance);
    } else if (!relay.timer) {
      relay.timer = setTimeout(
        () => this.flushRelay(topic, instance),
        interval
      );
    }
  }

  /** @internal */
  private flushRelay(
    topic: Topic,
    instance: StreamInstance,
    extra: Pick<RelayMessage, 'start' | 'end'> = {}
  ): void {
    const relay = this.relayState(instance);
    clearTimeout(relay.timer);
    relay.timer = undefined;

    const message: RelayMessage = {
      from: this.instanceId,
      streamId: instance.streamId,
      ...(extra.start ? { start: extra.start } : {}),
      chunks: relay.chunks.splice(0),
      ...(extra.end ? { end: extra.end } : {})
    };
    relay.bytes = 0;
    relay.lastSent = Date.now();

    this._pubsub
      .publish(topic.channel, message)
      .catch((e) =>
        logger.error(e, `Realtime stream '${topic.name}' relay failed`)
      );
  }

  /** @internal */
  private sendSnapshot(topic: Topic, instance: StreamInstance): void {
    // The chunks waiting for the relay are among the kept ones
    const relay = this.relayState(instance);
    relay.chunks.length = 0;
    relay.bytes = 0;

    relay.chunks.push(
      ...instance.ring.map((entry): [number, unknown, true?] =>
        entry.sync ? [entry.seq, entry.data, true] : [entry.seq, entry.data]
      )
    );
    const action = this._actions.get(instance.streamId);
    const end = instance.endEntry?.frame.message as RelayEnd | undefined;
    this.flushRelay(topic, instance, {
      start: {
        codec: instance.settings.codec,
        ...(instance.settings.mimeType
          ? { mimeType: instance.settings.mimeType }
          : {}),
        seq:
          instance.ring[0]?.seq ?? instance.endEntry?.seq ?? instance.nextSeq,
        ...(action && topic.name === ACTION_TOPIC
          ? { owner: action.owner }
          : {})
      },
      ...(end ? { end: withoutSid(end) } : {})
    });
  }

  /** @internal */
  private relayState(instance: StreamInstance): RelayState {
    let relay = this._relays.get(instance);
    if (!relay) {
      relay = { chunks: [], bytes: 0, lastSent: 0 };
      this._relays.set(instance, relay);
    }
    return relay;
  }

  /** @internal */
  private ended(
    topic: Topic,
    instance: StreamInstance,
    entry?: RingEntry
  ): void {
    const owned = entry !== undefined;
    if (owned) {
      if (this.remoteInterest(topic) > 0) {
        this.flushRelay(topic, instance, {
          end: withoutSid(entry.frame.message as RelayEnd)
        });
      }
      const relay = this._relays.get(instance);
      clearTimeout(relay?.timer);
      this._relays.delete(instance);
      this.endTrace(instance, entry);
    }

    // Kept a while for the subscribers resuming it
    this.later(() => {
      if (topic.instances.get(instance.streamId)?.instance === instance) {
        topic.instances.delete(instance.streamId);
        this.dropTopic(topic);
      }
    });
  }

  /** @internal */
  private lingerAction(instance: StreamInstance): void {
    const action = this._actions.get(instance.streamId);
    if (!action || instance.ended) {
      return;
    }
    clearTimeout(action.linger);
    action.linger = setTimeout(() => {
      this._timers.delete(action.linger!);
      // Its caller may read it from another instance
      if (
        instance.sinks.size === 0 &&
        this.remoteInterest(topicKey(ACTION_TOPIC, instance.streamId)) === 0
      ) {
        instance.cancel();
      }
    }, realtimeConfig.STREAM_LINGER);
    action.linger.unref();
    this._timers.add(action.linger);
  }

  /**
   * Lingers a streaming action no other instance relays any more, unless a subscriber of this one reads it.
   *
   * @internal
   */
  private relingerAction(name: string, key: string): void {
    const action = name === ACTION_TOPIC ? this._actions.get(key) : undefined;
    if (action && action.instance.sinks.size === 0) {
      this.lingerAction(action.instance);
    }
  }

  /** @internal */
  private later(fn: () => void): void {
    const timer = setTimeout(() => {
      this._timers.delete(timer);
      fn();
    }, realtimeConfig.STREAM_LINGER);
    timer.unref();
    this._timers.add(timer);
  }

  /** @internal */
  private remoteInterest(topic: Topic | string): number {
    const instances = this._interest.get(
      typeof topic === 'string' ? topic : topicKey(topic.name, topic.key)
    );
    if (!instances) {
      return 0;
    }
    const timeout = realtimeConfig.STREAM_RELAY_HEARTBEAT * MISSED_HEARTBEATS;
    const now = Date.now();
    let count = 0;
    for (const seen of instances.values()) {
      if (now - seen <= timeout) {
        count++;
      }
    }
    return count;
  }

  /** @internal */
  private async publishControl(
    op: ControlMessage['op'],
    topics: Pick<Topic, 'name' | 'key'>[],
    owner?: string | null
  ): Promise<void> {
    const message: ControlMessage = {
      op,
      from: this.instanceId,
      topics: topics.map((topic) => [topic.name, topic.key]),
      ...(owner !== undefined ? { owner } : {})
    };
    try {
      await this._pubsub.publish(CONTROL_CHANNEL, message);
    } catch (e) {
      logger.error(e, 'Realtime stream interest publish failed');
    }
  }

  /** @internal */
  private startHeartbeat(): void {
    if (this._heartbeat || this._destroyed) {
      return;
    }
    this._heartbeat = setInterval(
      () => this.heartbeat(),
      realtimeConfig.STREAM_RELAY_HEARTBEAT
    );
    this._heartbeat.unref();
  }

  /** @internal */
  private trace(instance: StreamInstance): void {
    this._traced.add(instance);
    realtimeMetrics.streams(instance.name, 1);
    if (!telemetryEnabled('realtime')) {
      return;
    }
    const { span } = startSpan(`realtime stream ${instance.name}`, {
      kind: SpanKind.PRODUCER,
      attributes: {
        'appweaver.realtime.stream': instance.name,
        'appweaver.realtime.stream.id': instance.streamId
      }
    });
    this._spans.set(instance, span);
  }

  /** @internal */
  private endTrace(instance: StreamInstance, entry: RingEntry): void {
    // The streams of the actions are traced by the spans of their calls
    if (!this._traced.delete(instance)) {
      return;
    }
    realtimeMetrics.streams(instance.name, -1);
    const span = this._spans.get(instance);
    if (!span) {
      return;
    }
    this._spans.delete(instance);
    const message = entry.frame.message;
    span.setAttribute('appweaver.realtime.stream.chunks', message.seq);
    if (message.type === 'stream.error') {
      const problem = message.error as { title?: string; detail?: string };
      failSpan(span, new Error(problem?.detail ?? problem?.title));
    }
    span.end();
  }
}

/** The key of the subscribers of a key of a stream. */
function topicKey(name: string, key: string): string {
  return `${name}#${key}`;
}

/** The name and the key of a key of a topic, the name never holding a `#`. */
function splitTopicKey(id: string): [name: string, key: string] {
  const index = id.indexOf('#');
  return [id.slice(0, index), id.slice(index + 1)];
}

function withoutSid(end: RelayEnd): DistributiveOmit<RelayEnd, 'sid'> {
  const { sid, ...rest } = end;
  return rest;
}

function streamNotFound(streamId: string): RealtimeError {
  return new RealtimeError(
    ErrorCode.RealtimeStreamNotFound,
    `Realtime stream '${streamId}' not found`,
    { streamId }
  );
}

/** The sequence number a sink resumes a stream from, when it resumes this one. */
function resumeSeq(
  resume: SinkResume | undefined,
  instance: StreamInstance
): number | undefined {
  return resume?.streamId === instance.streamId ? resume.seq : undefined;
}
