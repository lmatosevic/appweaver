import { createTask, inject } from '@appweaver/core';
import { loanConfig } from '@/modules/loan/config';
import { formatMoney, formatTable } from '@/modules/loan/format';
import { LoanCalculator, RateComparison } from '@/modules/loan/loan-calculator';
import { reportError } from './amortize';

/**
 * Prints the monthly payment and the total interest of a loan at every rate, from the cheapest, i.e.
 * `weaver run compare 300000 360 3.9 4.5 5.1`.
 */
export default createTask({
  description: 'Compares the cost of a loan at several interest rates.',
  arguments: {
    principal: {
      type: 'number',
      required: true,
      description: 'The amount borrowed.'
    },
    months: {
      type: 'number',
      required: true,
      description: 'The term in months.'
    },
    rates: {
      type: 'number',
      required: true,
      variadic: true,
      description: 'The annual interest rates in percent.'
    }
  },
  run: async ({ args }) => {
    let comparisons: RateComparison[];
    try {
      comparisons = await inject(LoanCalculator).compare(
        args.principal,
        args.months,
        args.rates
      );
    } catch (e) {
      return reportError(e);
    }
    printComparisons(comparisons);
    return 0;
  }
});

/** Prints the comparisons as a table, with the extra interest over the cheapest rate. */
function printComparisons(comparisons: RateComparison[]): void {
  const money = (cents: number) => formatMoney(cents, loanConfig.CURRENCY);
  const cheapest = comparisons[0].totalInterest;

  console.log(
    formatTable([
      ['Rate', 'Payment', 'Interest', 'Extra'],
      ...comparisons.map((item) => [
        `${item.annualRate}%`,
        money(item.payment),
        money(item.totalInterest),
        money(item.totalInterest - cheapest)
      ])
    ])
  );
}
