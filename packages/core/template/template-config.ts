import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const templateConfig = defineConfig('template', {
  /** Directory of the template files, i.e. the email templates. Default: `'./templates'`. */
  PATH: Type.String({ default: './templates' }),
  /** Keep the loaded templates in memory, disable it to reload the changed template files on every render. Default:
   * `true`. */
  CACHE: Type.Boolean({ default: true }),
  /** Template engine provider implementation path, empty to load none. Default:
   * `'@appweaver/core/template/handlebars-template-engine'`. */
  PROVIDER: Type.String({
    default: '@appweaver/core/template/handlebars-template-engine'
  })
});

export const templatePreviewConfig = defineConfig('template.preview', {
  /** Enable the route rendering a template with the data of its query parameters, for previewing the templates during
   * development. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** Require authentication for the template preview route. Default: `false`. */
  AUTH: Type.Boolean({ default: false }),
  /** URL prefix for the template preview route. Default: `'/templates'`. */
  ROUTE_PREFIX: Type.String({ default: '/templates' })
});
