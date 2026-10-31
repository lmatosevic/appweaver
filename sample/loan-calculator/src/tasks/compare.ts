import { inject } from '@appweaver/core';
import { loanConfig } from '@/modules/loan/config';
import { formatMoney, formatTable } from '@/modules/loan/format';
import { LoanCalculator, RateComparison } from '@/modules/loan/loan-calculator';
import { reportError } from './amortize';

const usage =
  'Usage: weaver run src/tasks/compare.ts <principal> <months> <rate> [rate...]';

/** Prints the monthly payment and the total interest of a loan at every rate, from the cheapest. */
export default async function (args: string[]): Promise<number> {
  const [principal, months, ...rates] = args;
  if (!principal || !months || rates.length === 0) {
    console.error(usage);
    return 1;
  }

  let comparisons: RateComparison[];
  try {
    comparisons = await inject(LoanCalculator).compare(
      Number(principal),
      Number(months),
      rates.map(Number)
    );
  } catch (e) {
    return reportError(e);
  }
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
  return 0;
}
