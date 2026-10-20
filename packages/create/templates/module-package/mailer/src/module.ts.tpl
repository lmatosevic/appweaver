import { defineModule, Mailer } from '@appweaver/common';
import { {{CONFIG_NAME}} } from './config';

export default defineModule({
  name: '{{PACKAGE_NAME}}',
  framework: '^{{VERSION}}',
  config: [{{CONFIG_NAME}}],
  providers: [
    {
      contract: Mailer,
      name: '{{MODULE_NAME}}',
      load: () => import('./mailer')
    }
  ]
});
