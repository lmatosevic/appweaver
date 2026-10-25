import { defineModule } from '@appweaver/common';
import { {{CONFIG_NAME}} } from './config';

export default defineModule({
  name: '{{PACKAGE_NAME}}',
  framework: '^{{VERSION}}',
  config: [{{CONFIG_NAME}}],
  // The loggers it creates, suggested in log.levels of appweaver.json
  loggers: ['{{LOGGER_NAME}}'],
  // Classes defined at startup, with their lifecycle hooks:
  // services: [{ load: () => import('./service') }],
  // Its translations, templates and seeders, beside the ones of the application:
  // locales: path.join(__dirname, '../locales'),
  main: () => import('./main')
});
