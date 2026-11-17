import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const pubsubConfig = defineConfig('pubsub', {
  /** Publish/subscribe provider: `auto` (`redis` when its module is enabled, otherwise `memory`), `memory`, `redis`,
   * `none`, or the module path of an implementation. Default: `'auto'`. */
  PROVIDER: Type.String({ default: 'auto' })
});
