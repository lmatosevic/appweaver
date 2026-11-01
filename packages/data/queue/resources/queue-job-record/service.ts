import { queueHistoryConfig } from '@appweaver/core';
import { createService } from '../../../factory/create-service';

// Reads the queue history, i.e. with `injectService` or the resource routes of an application
export default queueHistoryConfig.ENABLED ||
queueHistoryConfig.KEEP_DATABASE_TABLE
  ? createService({ modelName: 'QueueJobRecord' })
  : undefined;
