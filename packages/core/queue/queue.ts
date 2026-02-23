import { QueueProcessor } from './queue-processor';
import { HealthCheck, HealthCheckResult } from '../types';
import { HEALTH_CHECK } from '../constants';

export class Queue implements HealthCheck {
  private readonly queues: Record<string, QueueProcessor> = {};

  public get<T = any, R = any>(name: string): QueueProcessor<T, R> {
    if (!this.queues[name]) {
      this.queues[name] = new QueueProcessor(name);
    }
    return this.queues[name];
  }

  public async close(name: string): Promise<boolean> {
    if (!this.queues[name]) {
      return false;
    }
    await this.queues[name].close();
    delete this.queues[name];
    return true;
  }

  public async closeAll(): Promise<void> {
    for (const queueName of Object.keys(this.queues)) {
      await this.close(queueName);
    }
  }

  public async checkHealth(): Promise<HealthCheckResult> {
    try {
      const queue = new QueueProcessor('health-check');
      await queue.close();
      return { success: true };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }
}

Queue[HEALTH_CHECK] = true;
