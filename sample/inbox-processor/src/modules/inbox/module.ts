import { defineModule, Memory, Queue } from '@appweaver/common';
import { inboxConfig } from './config';

/** The inbox module, enabled by its file matching app.modulesPattern. */
export default defineModule({
  name: 'inbox',
  config: [inboxConfig],
  loggers: ['inbox'],
  // The watcher of the inbox file, started and stopped with the application
  services: [
    { load: () => import('./inbox-watcher'), requires: [Memory, Queue] }
  ],
  // The worker of the entry queue
  main: () => import('./main'),
  // The routes of the inbox, registered with the server of @appweaver/web
  web: () => import('./routes')
});
