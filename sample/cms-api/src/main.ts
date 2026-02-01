import { createApp } from '@appweaver/core';
import { logger } from '@appweaver/common';
import './resources';

createApp({ start: true }).catch((err) => {
  logger.error(err);
  process.exit(1);
});
