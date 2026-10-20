import { registerPlugin, Server } from '@appweaver/web';
import { logger } from '@appweaver/common';

registerPlugin('RequestLogger', (server: Server) => {
  server.addHook('onRequest', async (req) => {
    logger.trace(`Request received: ${req.method} ${req.url}`);
  });
});
