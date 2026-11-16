import { defineModule, Memory, PubSub } from '@appweaver/common';
import { realtimeConfig } from './config';

/** The realtime connections: the channels, the resource events and the actions, over SSE and WebSocket. */
export default defineModule({
  name: '@appweaver/realtime',
  requires: ['@appweaver/web'],
  config: [realtimeConfig],
  loggers: ['realtime'],
  services: [
    { load: () => import('./gateway/ticket-service'), requires: [Memory] },
    { load: () => import('./gateway/realtime-gateway'), requires: [PubSub] }
  ],
  web: async () =>
    (await import('./web/realtime-routes')).registerRealtimeRoutes()
});
