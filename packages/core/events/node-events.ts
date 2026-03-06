import {
  ActionType,
  config,
  EventData,
  EventListener,
  Events,
  logger,
  uuid
} from '@appweaver/common';

export class NodeEvents extends Events {
  /** @internal */
  private readonly _eventListeners: Record<
    string,
    { eventName: string; listener: EventListener }
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
    listener: EventListener<T>
  ): string {
    const listenerId = uuid();
    const eventName = this.resourceEventName(resourceName, event);
    this._eventListeners[listenerId] = { eventName, listener };
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
    const listener = this._eventListeners[listenerId];
    if (!listener) {
      return false;
    }
    this.off(listener.eventName, listener.listener);
    delete this._eventListeners[listenerId];
    return true;
  }

  /** @internal */
  private resourceEventName(resourceName: string, event: ActionType): string {
    return `${resourceName}.${event}`;
  }
}
