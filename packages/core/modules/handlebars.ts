import { defineModule, TemplateEngine } from '@appweaver/common';

/** The Handlebars template engine. */
export default defineModule({
  name: '@appweaver/handlebars',
  providers: [
    {
      contract: TemplateEngine,
      name: 'handlebars',
      load: () => import('../template/handlebars-template-engine')
    }
  ]
});
