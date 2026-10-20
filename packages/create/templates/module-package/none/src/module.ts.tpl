import { defineModule } from '@appweaver/common';
import { {{CONFIG_NAME}} } from './config';

export default defineModule({
  name: '{{PACKAGE_NAME}}',
  framework: '^{{VERSION}}',
  config: [{{CONFIG_NAME}}],
  // Classes defined at startup, with their lifecycle hooks:
  // services: [{ load: () => import('./service') }],
  main: () => import('./main')
});
