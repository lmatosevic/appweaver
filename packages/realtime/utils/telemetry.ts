import {
  telemetryCounter,
  telemetryEnabled,
  telemetryUpDownCounter
} from '@appweaver/common';

const openConnections = telemetryUpDownCounter(
  'appweaver.realtime.connections',
  { description: 'The open realtime connections', unit: '{connection}' }
);

const deliveredEvents = telemetryCounter('appweaver.realtime.events', {
  description: 'The realtime events, by their outcome',
  unit: '{event}'
});

const openStreams = telemetryUpDownCounter('appweaver.realtime.streams', {
  description: 'The open realtime streams of the producers of the instance',
  unit: '{stream}'
});

const streamChunks = telemetryCounter('appweaver.realtime.stream.chunks', {
  description:
    'The chunks of the realtime streams, sent once to every subscriber',
  unit: '{chunk}'
});

const streamBytes = telemetryCounter('appweaver.realtime.stream.bytes', {
  description: 'The encoded bytes of the chunks of the realtime streams',
  unit: 'By'
});

const inputBytes = telemetryCounter('appweaver.realtime.input.bytes', {
  description: 'The bytes the clients stream to the actions with an input',
  unit: 'By'
});

const clientMessages = telemetryCounter('appweaver.realtime.messages', {
  description: 'The messages of the realtime clients',
  unit: '{message}'
});

/** The metrics of the realtime connections, recorded while the `realtime` instrumentation is on. */
export const realtimeMetrics = {
  /** Counts a connection opened (`1`) or closed (`-1`). */
  connections(transport: 'sse' | 'websocket', change: 1 | -1): void {
    if (telemetryEnabled('realtime')) {
      openConnections().add(change, {
        'appweaver.realtime.transport': transport
      });
    }
  },
  /** Counts an event of a channel, delivered to a connection, denied by an access check or dropped. */
  events(channel: string, outcome: 'delivered' | 'denied' | 'dropped'): void {
    if (telemetryEnabled('realtime')) {
      deliveredEvents().add(1, {
        'appweaver.realtime.channel': channel,
        'appweaver.realtime.outcome': outcome
      });
    }
  },
  /** Counts a stream of a producer opened (`1`) or ended (`-1`). */
  streams(name: string, change: 1 | -1): void {
    if (telemetryEnabled('realtime')) {
      openStreams().add(change, { 'appweaver.realtime.stream': name });
    }
  },
  /** Counts a chunk of a stream and its bytes. */
  streamChunk(name: string, bytes: number): void {
    if (telemetryEnabled('realtime')) {
      const attributes = { 'appweaver.realtime.stream': name };
      streamChunks().add(1, attributes);
      streamBytes().add(bytes, attributes);
    }
  },
  /** Counts the bytes of a chunk a client streams to an action. */
  inputBytes(action: string, bytes: number): void {
    if (telemetryEnabled('realtime')) {
      inputBytes().add(bytes, { 'appweaver.realtime.action': action });
    }
  },
  /** Counts a message of a client. */
  messages(type: string, ack: boolean): void {
    if (telemetryEnabled('realtime')) {
      clientMessages().add(1, {
        'appweaver.realtime.message': type,
        'appweaver.realtime.ack': ack
      });
    }
  }
};
