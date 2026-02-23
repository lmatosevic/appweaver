import { HealthCheck, HealthCheckResult } from '../health';
import { QueueInstance } from './queue-instance';

export class Queue implements HealthCheck {
  private readonly queues: Record<string, QueueInstance> = {};

  public get<T = any, R = any>(name: string): QueueInstance<T, R> {
    if (!this.queues[name]) {
      this.queues[name] = new QueueInstance(name);
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
      const queue = new QueueInstance('health-check');
      await queue.close();
      return { success: true };
    } catch (e) {
      return { success: false, message: (e as Error).message };
    }
  }
}

const queue = new Queue();

export { queue };
