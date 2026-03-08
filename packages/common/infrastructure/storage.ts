import { Readable } from 'node:stream';
import {
  HealthCheckConfig,
  HealthCheckResult,
  IHealthCheck,
  OnInit
} from '../interfaces';
import { HEALTH_CHECK, LIFECYCLE } from '../constants';

export type ContentStream = {
  stream: Readable;
  size: number;
};

export abstract class Storage implements IHealthCheck, OnInit {
  static [LIFECYCLE]: true;
  static [HEALTH_CHECK] = true;

  abstract onInit(): Promise<void>;

  abstract stream(
    fileName: string,
    start: number,
    end?: number
  ): Promise<ContentStream | null>;

  abstract store(fileName: string, data: Readable): Promise<string | null>;

  abstract delete(fileName: string): Promise<boolean>;

  abstract exists(fileName: string): Promise<boolean>;

  abstract checkHealth(): Promise<HealthCheckResult>;

  public checkHealthConfig(): HealthCheckConfig {
    return { name: 'storage' };
  }
}
