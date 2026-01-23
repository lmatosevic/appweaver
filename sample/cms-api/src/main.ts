import { createApp } from '@appweaver/core';
import { logger } from '@appweaver/common';

async function main() {
  const app = await createApp();
  logger.info('Application created successfully');
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
