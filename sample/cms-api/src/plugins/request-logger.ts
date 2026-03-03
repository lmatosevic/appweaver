import { registerPlugin, Server } from '@appweaver/core';
import { logger } from '@appweaver/common';

registerPlugin('RequestLogger', (server: Server) => {
  server.addHook('onRequest', (req, _, next) => {
    logger.trace(`Request received: ${req.method} ${req.url}`);
    next();
  });
});
