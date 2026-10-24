import { Type } from '@sinclair/typebox';
import { defineConfig } from '@appweaver/common';

export const templatePreviewConfig = defineConfig('template.preview', {
  /** Enable the route rendering a template with the data of its query parameters, for previewing the templates during
   * development. Default: `false`. */
  ENABLED: Type.Boolean({ default: false }),
  /** Require authentication for the template preview route. Default: `false`. */
  AUTH: Type.Boolean({ default: false }),
  /** URL prefix for the template preview route. Default: `'/templates'`. */
  ROUTE_PREFIX: Type.String({ default: '/templates' })
});
