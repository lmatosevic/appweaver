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
