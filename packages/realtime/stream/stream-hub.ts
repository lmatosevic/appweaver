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
  uuid
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
  start?: { codec: StreamSettings['codec']; mimeType?: string; seq: number };
  /** The chunks, as `[seq, data, sync]` */
  chunks: [number, unknown, true?][];
  /** The end of the stream, without its `sid` */
  end?: DistributiveOmit<RelayEnd, 'sid'>;
};

/** A message of the control channel: the instances with a subscriber of the keys of streams, or an instance starting
 * asking for them. */
export type ControlMessage = {
  op: 'interest' | 'interest-end' | 'query';
  from: string;
  topics: [name: string, key: string][];
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
  public readonly instanceId: string = uuid();

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
      uuid(),
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
   * Opens the stream of a streaming action, reaching only the subscribers the gateway attaches, never relayed.
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
    const streamId = uuid();
    const instance = new StreamInstance(
      ++this._sid,
      streamId,
      name,
      streamId,
      settings,
      {
        onEmpty: (empty) => this.lingerAction(empty),
        onEnd: (ended) => {
          const action = this._actions.get(ended.streamId);
          clearTimeout(action?.linger);
          this.later(() => this._actions.delete(ended.streamId));
        }
      }
    );
    this._actions.set(streamId, { instance, owner });
    return instance;
  }

  /**
   * Attaches a subscriber to the stream of a streaming action again, i.e. after a reconnection, resuming from a
   * sequence number.
   *
   * @param {string} streamId - The ID of the stream.
   * @param {string | null} owner - The ID of the user, the one who called the action.
   * @param {StreamSink} sink - The subscriber.
   * @param {number} seq - The sequence number to resume from.
   * @return {StreamInstance} The stream.
   * @throws {RealtimeError} `REALTIME_STREAM_NOT_FOUND` for a stream gone, or of another user.
   */
  public resumeAction(
    streamId: string,
    owner: string | null,
    sink: StreamSink,
    seq: number
  ): StreamInstance {
    const action = this._actions.get(streamId);
    if (!action || action.owner !== owner) {
      throw new RealtimeError(
        ErrorCode.RealtimeStreamNotFound,
        `Realtime stream '${streamId}' not found`,
        { streamId }
      );
    }
    clearTimeout(action.linger);
    action.linger = undefined;
    action.instance.attach(sink, seq);
    return action.instance;
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

    if (!topic.relay) {
      topic.relay = this._pubsub.subscribe<RelayMessage>(
        topic.channel,
        (message) => this.receive(topic, message)
      );
      this.startHeartbeat();
      void this.publishControl('interest', [topic]);
    }

    try {
      await topic.relay;
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
      if (message.op === 'interest-end') {
        this._interest.get(id)?.delete(message.from);
        continue;
      }

      let instances = this._interest.get(id);
      if (!instances) {
        instances = new Map();
        this._interest.set(id, instances);
      }
      const known = instances.has(message.from);
      instances.set(message.from, Date.now());

      const topic = this._topics.get(id);
      if (!known && topic) {
        for (const { instance, owned } of topic.instances.values()) {
          if (owned && !instance.ended) {
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
    const id = topicKey(stream.name, key);
    let topic = this._topics.get(id);
    if (!topic) {
      topic = {
        name: stream.name,
        key,
        settings: streamSettings(stream.config),
        channel: `${PUBSUB_CHANNEL_PREFIX}stream:${stream.name}#${key}`,
        sinks: new Map(),
        instances: new Map()
      };
      this._topics.set(id, topic);
    }
    return topic;
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
    if (message.from === this.instanceId || topic.sinks.size === 0) {
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
      for (const [seq, data, sync] of message.chunks ?? []) {
        mirror.ingest(seq, data, sync);
      }
      for (const [sink, resume] of topic.sinks) {
        mirror.attach(sink, resumeSeq(resume, mirror));
      }
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
    this.flushRelay(topic, instance, {
      start: {
        codec: instance.settings.codec,
        ...(instance.settings.mimeType
          ? { mimeType: instance.settings.mimeType }
          : {}),
        seq: instance.ring[0]?.seq ?? instance.nextSeq
      }
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
        const { sid, ...end } = entry.frame.message as RelayEnd;
        this.flushRelay(topic, instance, { end });
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
      if (instance.sinks.size === 0) {
        instance.cancel();
      }
    }, realtimeConfig.STREAM_LINGER);
    action.linger.unref();
    this._timers.add(action.linger);
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
    topics: Topic[]
  ): Promise<void> {
    const message: ControlMessage = {
      op,
      from: this.instanceId,
      topics: topics.map((topic) => [topic.name, topic.key])
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

/** The sequence number a sink resumes a stream from, when it resumes this one. */
function resumeSeq(
  resume: SinkResume | undefined,
  instance: StreamInstance
): number | undefined {
  return resume?.streamId === instance.streamId ? resume.seq : undefined;
}
