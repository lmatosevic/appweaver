import { EventEmitter } from 'node:events';
import { ActionType } from '../types';

export type EventData<T = any> = { previous?: T; current: T };

export type EventListener<T = any> = (data: EventData<T>) => void;

export abstract class Events extends EventEmitter {
  /**
   * Registers a listener for a resource event.
   *
   * @param {string} resourceName - The resource to listen on.
   * @param {ActionType} event - The action type to listen for.
   * @param {EventListener} listener - The callback invoked when the event fires.
   * @returns A listener ID for later removal.
   */
  abstract onResourceEvent<T>(
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
   * @returns `true` if listeners were notified, `false` otherwise.
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
   * @returns `true` if the listener was found and removed, `false` otherwise.
   */
  abstract removeResourceEvent(listenerId: string): boolean;
}
