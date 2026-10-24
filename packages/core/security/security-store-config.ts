import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const securityStoreConfig = defineConfig('security.store', {
  /** Security store provider: `auto` (`database` with a database, otherwise none), `database`, `memory` (stores
   * the tokens in the `Memory` provider, i.e. Redis), `none`, or the module path of an implementation. Default: `'auto'`. */
  PROVIDER: Type.String({ default: 'auto' }),
  /** Keep the one-time token table when another security store is used. Default: `false`. */
  KEEP_DATABASE_TABLE: Type.Boolean({ default: false })
});
