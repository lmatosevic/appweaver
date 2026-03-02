import { Readable } from 'node:stream';
import { HealthCheckResult, IHealthCheck } from './health-check';
import { HEALTH_CHECK } from '../constants';

export type ContentStream = {
  stream: Readable;
  size: number;
};

export abstract class Storage implements IHealthCheck {
  constructor() {
    this[HEALTH_CHECK] = true;
  }

  abstract init(): Promise<void>;

  abstract stream(
    fileName: string,
    start: number,
    end?: number
  ): Promise<ContentStream | null>;

  abstract store(fileName: string, data: Readable): Promise<string | null>;

  abstract delete(fileName: string): Promise<boolean>;

  abstract exists(fileName: string): Promise<boolean>;

  abstract checkHealth(): Promise<HealthCheckResult>;

  abstract checkHealth(): Promise<HealthCheckResult>;
}
