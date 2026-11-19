import { defineModule } from '@appweaver/common';
import { aiConfig } from './config';

/**
 * The calls of the AI models: the endpoints of the `ai` config, `AiService`, the tools and the built-in `mock`
 * driver. The drivers of the endpoints are the `AiDriver` providers of the driver modules, i.e. `openai` of
 * `@appweaver/openai`, all of them usable at once.
 */
export default defineModule({
  name: '@appweaver/ai',
  config: [aiConfig],
  loggers: ['ai'],
  services: [{ load: () => import('./service/ai-service') }]
});
