import { AiDriver } from '@appweaver/ai';
import { defineModule } from '@appweaver/common';

/** The `openai` driver of the AI endpoints, for OpenAI and every OpenAI-compatible server. */
export default defineModule({
  name: '@appweaver/openai',
  requires: ['@appweaver/ai'],
  loggers: ['ai'],
  providers: [
    {
      contract: AiDriver,
      name: 'openai',
      load: () => import('./openai-driver')
    }
  ]
});
