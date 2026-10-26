import { defineModule } from '@appweaver/common';
import { loanConfig } from './config';

/** The loan module, enabled by its file matching app.modulesPattern. */
export default defineModule({
  name: 'loan',
  config: [loanConfig],
  // The loggers it creates, suggested in log.levels of appweaver.json
  loggers: ['loan'],
  // Defined at startup, injected as inject(LoanCalculator)
  services: [{ load: () => import('./loan-calculator') }],
  main: () => import('./main')
});
