import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const fileVersionsConfig = defineConfig('storage.versions', {
  /** Keep the previous versions of the files when a file is uploaded again, with the routes listing and deleting
   * them. The `versions` of a file field overrides the limits, `false` turning it off for the field.
   * Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** The most versions of a file kept, the current one included, `0` for no limit. Default: `10`. */
  MAX_COUNT: Type.Integer({ minimum: 0, default: 10 }),
  /** How long a version is kept once replaced, a duration (`30d`), empty to keep it until `MAX_COUNT` drops it.
   * Default: `''`. */
  MAX_AGE: Type.String({ default: '' }),
  /** How often the versions older than their `MAX_AGE` are deleted, a duration. Default: `'1h'`. */
  PRUNE_INTERVAL: Type.String({ default: '1h' })
});
