import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

/** The config of the module, read from config.{{CONFIG_SECTION}} and the {{CONFIG_PREFIX}}* variables. */
export const {{CONFIG_NAME}} = defineConfig('{{CONFIG_SECTION}}', {
  /** An example key, i.e. the name of a bucket or the key of an API. */
  EXAMPLE: Type.String({ default: 'example' })
});
