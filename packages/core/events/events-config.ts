import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const eventsConfig = defineConfig('events', {
  /** Maximum event listeners per event type. Default: `20`. */
  MAX_LISTENERS: Type.Integer({ default: 20 }),
  /** Event emitter provider: `auto` or `node`, or the module path of an implementation. Default: `'auto'`. */
  PROVIDER: Type.String({ default: 'auto' })
});
