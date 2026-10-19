import { createApp } from '@appweaver/core';
import { logger } from '@appweaver/common';

createApp().catch((err) => {
  logger.error(err);
  process.exit(1);
});
