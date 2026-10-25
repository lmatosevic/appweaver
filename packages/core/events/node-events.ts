import {
  ActionType,
  EventData,
  EventListener,
  Events,
  createLogger,
  uuid
} from '@appweaver/common';
import { eventsConfig } from './events-config';
import { afterCommit, currentTransaction } from '../context';

const logger = createLogger('events');

export class NodeEvents extends Events {
  /** @internal */
  private readonly _eventListeners: Record<
    string,
    { eventName: string; listener: EventListener }
  > = {};

  constructor() {
    super({ captureRejections: true });
    this.setMaxListeners(eventsConfig.MAX_LISTENERS);
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
    logger.debug({ event: eventName, listenerId }, 'Event listener added');
    return listenerId;
  }

  public emitResourceEvent<T>(
    resourceName: string,
    event: ActionType,
    data: EventData<T>
  ): boolean {
    const eventName = this.resourceEventName(resourceName, event);

    const listeners = this.listenerCount(eventName);

    // Deferred to the commit, so no listener acts on a change a rollback discards
    if (currentTransaction()) {
      afterCommit(() => this.emit(eventName, data));
      logger.debug(
        { event: eventName, listeners },
        'Event deferred to the commit'
      );
      return listeners > 0;
    }

    logger.debug({ event: eventName, listeners }, 'Event emitted');
    return this.emit(eventName, data);
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
