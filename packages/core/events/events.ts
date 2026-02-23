import { EventEmitter } from 'node:events';
import { ActionType, config, logger, uuid } from '@appweaver/common';

export type EventData<T = any> = { previous?: T; current: T };

export type ListenerFn<T = any> = (data: EventData<T>) => void;

export class Events extends EventEmitter {
  private readonly eventListeners: Record<
    string,
    { eventName: string; listener: ListenerFn }
  > = {};

  constructor() {
    super({ captureRejections: true });
    this.setMaxListeners(config.EVENTS_MAX_LISTENERS);
    this.on('error', (e: Error) => {
      logger.error(e, 'Event handler error');
    });
  }

  public onResourceEvent<T>(
    resourceName: string,
    event: ActionType,
    listener: ListenerFn<T>
  ): string {
    const listenerId = uuid();
    const eventName = this.resourceEventName(resourceName, event);
    this.eventListeners[listenerId] = { eventName, listener };
    this.on(eventName, listener);
    return listenerId;
  }

  public emitResourceEvent<T>(
    resourceName: string,
    event: ActionType,
    data: EventData<T>
  ): boolean {
    return this.emit(this.resourceEventName(resourceName, event), data);
  }

  public removeResourceEvent(listenerId: string): boolean {
    const listener = this.eventListeners[listenerId];
    if (!listener) {
      return false;
    }
    this.removeListener(listener.eventName, listener.listener);
    delete this.listeners[listenerId];
    return true;
  }

  private resourceEventName(resourceName: string, event: ActionType): string {
    return `${resourceName}.${event}`;
  }
}
