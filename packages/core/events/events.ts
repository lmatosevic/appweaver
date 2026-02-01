import { EventEmitter } from 'node:events';
import { logger, config, uuid } from '@appweaver/common';
import { ActionType, ResourceName } from '../types';

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
    resource: ResourceName,
    event: ActionType,
    listener: ListenerFn<T>
  ): string {
    const listenerId = uuid();
    const eventName = this.resourceEventName(resource, event);
    this.eventListeners[listenerId] = { eventName, listener };
    this.on(eventName, listener);
    return listenerId;
  }

  public emitResourceEvent<T>(
    resource: ResourceName,
    event: ActionType,
    data: EventData<T>
  ): boolean {
    return this.emit(this.resourceEventName(resource, event), data);
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

  private resourceEventName(resource: ResourceName, event: ActionType): string {
    return `${resource}.${event}`;
  }
}

const events = new Events();

export { events };
