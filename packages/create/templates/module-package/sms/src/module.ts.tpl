import { defineModule, SmsSender } from '@appweaver/common';
import { {{CONFIG_NAME}} } from './config';

export default defineModule({
  name: '{{PACKAGE_NAME}}',
  framework: '^{{VERSION}}',
  config: [{{CONFIG_NAME}}],
  providers: [
    {
      contract: SmsSender,
      name: '{{MODULE_NAME}}',
      load: () => import('./sms')
    }
  ]
});
