import { EventEmitter } from 'node:events';
import { ActionType, ModelName, ResourceRecord } from '../types';

export type EventData<T = any> = { current: T; previous?: T };

export type EventListener<T = any> = (data: EventData<T>) => void;

/**
 * The data of a resource event of a model, typed by its name once the types are generated: the record of the model,
 * with its foreign keys and relation counts, or an array of them for a `query`.
 */
export type ResourceEventData<
  N extends string,
  A extends ActionType
> = EventData<A extends 'query' ? ResourceRecord<N>[] : ResourceRecord<N>>;

export abstract class Events extends EventEmitter {
  /**
   * Registers a listener for a resource event. Once the types are generated, the records the listener receives are
   * typed by the model name, i.e. `onResourceEvent('Order', 'create', ({ current }) => current.total)`.
   *
   * @param {string} resourceName - The resource to listen on.
   * @param {ActionType} event - The action type to listen for.
   * @param {Function} listener - The callback invoked when the event fires.
   * @return A listener ID for later removal.
   */
  abstract onResourceEvent<N extends ModelName, A extends ActionType>(
    resourceName: N,
    event: A,
    listener: (data: ResourceEventData<N, A>) => void
  ): string;

  /**
   * Registers a listener for a resource event, its records typed by the given type, i.e. for a model name known only
   * at runtime.
   *
   * @param {string} resourceName - The resource to listen on.
   * @param {ActionType} event - The action type to listen for.
   * @param {EventListener} listener - The callback invoked when the event fires.
   * @return A listener ID for later removal.
   */
  abstract onResourceEvent<T = any>(
    resourceName: string,
    event: ActionType,
    listener: EventListener<T>
  ): string;

  /**
   * Emits an event for a resource.
   *
   * @param {string} resourceName - The resource emitting the event.
   * @param {ActionType} event - The action type being emitted.
   * @param {EventData} data - The event payload with optional previous and current state.
   * @return `true` if listeners were notified, `false` otherwise.
   */
  abstract emitResourceEvent<T>(
    resourceName: string,
    event: ActionType,
    data: EventData<T>
  ): boolean;

  /**
   * Removes a previously registered resource event listener.
   *
   * @param {string} listenerId - The listener ID to remove.
   * @return `true` if the listener was found and removed, `false` otherwise.
   */
  abstract removeResourceEvent(listenerId: string): boolean;
}
