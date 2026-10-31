import { defineModule } from '@appweaver/common';
import { loanConfig } from './config';

/** The loan module, enabled by its file matching app.modulesPattern. */
export default defineModule({
  name: 'loan',
  config: [loanConfig],
  loggers: ['loan'],
  // Defined at startup, injected as inject(LoanCalculator)
  services: [{ load: () => import('./loan-calculator') }],
  main: () => import('./main')
});
