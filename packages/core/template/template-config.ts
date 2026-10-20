import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const templateConfig = defineConfig('template', {
  /** Directory of the template files, i.e. the email templates. Default: `'./templates'`. */
  PATH: Type.String({ default: './templates' }),
  /** Keep the loaded templates in memory, disable it to reload the changed template files on every render. Default:
   * `true`. */
  CACHE: Type.Boolean({ default: true }),
  /** Template engine provider: `auto` (`handlebars` when its module is enabled, otherwise none), `handlebars`,
   * `none`, or the module path of an implementation. Default: `'auto'`. */
  PROVIDER: Type.String({ default: 'auto' })
});
