import { registerPlugin, Server } from '@appweaver/core';
import { logger } from '@appweaver/common';

registerPlugin('RequestLogger', (server: Server) => {
  server.addHook('onRequest', async (req) => {
    logger.trace(`Request received: ${req.method} ${req.url}`);
  });
});
