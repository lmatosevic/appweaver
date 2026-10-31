import { queueHistoryConfig } from '@appweaver/core';
import { createModel } from '../../../factory/create-model';

const shouldCreateModel =
  queueHistoryConfig.ENABLED || queueHistoryConfig.KEEP_DATABASE_TABLE;

// One record per sent job, a job id sent again gets a new one
export default shouldCreateModel
  ? createModel({
      name: 'QueueJobRecord',
      tableName: '_queue_jobs',
      id: {
        type: 'string',
        generator: 'uuid(7)'
      },
      audit: {
        createdById: false
      },
      scalars: {
        queue: { type: 'string', maxLength: 255 },
        jobId: { type: 'string', maxLength: 255 },
        name: { type: 'string', maxLength: 255 },
        state: {
          type: 'enum',
          values: [
            'pending',
            'scheduled',
            'running',
            'retrying',
            'completed',
            'failed',
            'stalled'
          ]
        },
        driver: { type: 'string', maxLength: 64, required: false },
        data: { type: 'json', required: false },
        result: { type: 'json', required: false },
        metadata: { type: 'json', required: false },
        options: { type: 'json', required: false },
        attempt: { type: 'int', default: 0 },
        maxAttempts: { type: 'int', required: false },
        priority: { type: 'int', required: false },
        errors: { type: 'json', default: [] },
        lastError: { type: 'string', required: false },
        enqueuedAt: { type: 'dateTime', required: false },
        scheduledAt: { type: 'dateTime', required: false },
        startedAt: { type: 'dateTime', required: false },
        finishedAt: { type: 'dateTime', required: false },
        durationMs: { type: 'int', required: false },
        enqueuedBy: { type: 'string', maxLength: 255, required: false },
        attemptedBy: { type: 'string', maxLength: 255, required: false },
        userId: { type: 'string', maxLength: 64, required: false },
        authType: { type: 'string', maxLength: 32, required: false },
        authSource: { type: 'string', maxLength: 32, required: false },
        apiKeyId: { type: 'string', maxLength: 64, required: false },
        parentId: { type: 'string', maxLength: 64, required: false },
        callerSite: { type: 'string', maxLength: 1024, required: false }
      },
      index: [
        ['queue', 'jobId'],
        ['queue', 'state'],
        ['state', 'finishedAt'],
        ['userId'],
        ['parentId']
      ]
    })
  : undefined;
