import { createApp, inject } from '@appweaver/core';
import { logger } from '@appweaver/common';
import { loanConfig } from '@/modules/loan/config';
import { formatMoney } from '@/modules/loan/format';
import { LoanCalculator } from '@/modules/loan/loan-calculator';

// Nothing keeps the application running: it starts, calculates an example
// loan with the configured defaults, and stops
createApp()
  .then(async (app) => {
    const { terms, payment, totalInterest } = await inject(
      LoanCalculator
    ).calculate({ principal: 200_000 });
    const money = (cents: number) => formatMoney(cents, loanConfig.CURRENCY);

    logger.info(
      `A loan of ${money(terms.principal * 100)} at ${terms.annualRate}% over ${terms.months} months ` +
        `is repaid with ${money(payment)} a month, ${money(totalInterest)} of interest in total`
    );
    await app.stop();
  })
  .catch((err) => {
    logger.error(err);
    process.exit(1);
  });
