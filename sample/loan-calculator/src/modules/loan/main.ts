import { createLogger } from '@appweaver/common';
import { loanConfig } from './config';

// Logs at the level of `log.levels.loan`, otherwise of `log.level`
const logger = createLogger('loan');

logger.debug(
  {
    rate: loanConfig.DEFAULT_RATE,
    months: loanConfig.DEFAULT_TERM_MONTHS,
    currency: loanConfig.CURRENCY
  },
  'Loan defaults'
);
