import { EventEmitter } from 'node:events';
import { ActionType } from '../types';

export type EventData<T = any> = { previous?: T; current: T };

export type EventListener<T = any> = (data: EventData<T>) => void;

export abstract class Events extends EventEmitter {
  abstract onResourceEvent<T>(
    resourceName: string,
    event: ActionType,
    listener: EventListener<T>
  ): string;

  abstract emitResourceEvent<T>(
    resourceName: string,
    event: ActionType,
    data: EventData<T>
  ): boolean;

  abstract removeResourceEvent(listenerId: string): boolean;
}
