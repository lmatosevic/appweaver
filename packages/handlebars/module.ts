import { defineModule, TemplateEngine } from '@appweaver/common';

/** The Handlebars template engine. */
export default defineModule({
  name: '@appweaver/handlebars',
  loggerNames: ['template'],
  providers: [
    {
      contract: TemplateEngine,
      name: 'handlebars',
      load: () => import('./handlebars-template-engine')
    }
  ]
});
