import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const imageConfig = defineConfig('image', {
  /** Image processor transforming the uploaded images: `auto` (`sharp` when its module is enabled, otherwise none,
   * keeping the images as they are uploaded), `sharp`, `none`, or the module path of an implementation. Default:
   * `'auto'`. */
  PROVIDER: Type.String({ default: 'auto' })
});
