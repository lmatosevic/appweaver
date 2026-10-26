import { ApplicationError } from '@appweaver/common';
import { inject } from '@appweaver/core';
import { loanConfig } from '@/modules/loan/config';
import {
  formatMoney,
  formatTable,
  yearlyInstallments
} from '@/modules/loan/format';
import { LoanCalculator } from '@/modules/loan/loan-calculator';

const usage =
  'Usage: weaver run src/tasks/amortize.ts <principal> [rate] [months] [monthly|yearly]';

/**
 * Prints the amortization schedule of a loan, by month or summed by year (the default), with the rate and the term
 * of the config unless given.
 */
export default async function (args: string[]): Promise<number> {
  const [principal, rate, months, period = 'yearly'] = args;
  if (!principal || !['monthly', 'yearly'].includes(period)) {
    console.error(usage);
    return 1;
  }

  let schedule;
  try {
    schedule = await inject(LoanCalculator).calculate({
      principal: Number(principal),
      annualRate: rate === undefined ? undefined : Number(rate),
      months: months === undefined ? undefined : Number(months)
    });
  } catch (e) {
    return reportError(e);
  }
  const money = (cents: number) => formatMoney(cents, loanConfig.CURRENCY);
  const { terms } = schedule;
  const rows =
    period === 'yearly' ? yearlyInstallments(schedule) : schedule.installments;

  console.log(
    `${money(terms.principal * 100)} at ${terms.annualRate}% over ${terms.months} months: ` +
      `${money(schedule.payment)} a month\n`
  );
  console.log(
    formatTable([
      [
        period === 'yearly' ? 'Year' : 'Month',
        'Payment',
        'Principal',
        'Interest',
        'Balance'
      ],
      ...rows.map((row) => [
        String(row.month),
        money(row.payment),
        money(row.principal),
        money(row.interest),
        money(row.balance)
      ])
    ])
  );
  console.log(
    `\nTotal paid ${money(schedule.totalPaid)}, interest ${money(schedule.totalInterest)}`
  );
  return 0;
}

/** Prints the invalid terms of a loan instead of the stack of a failed task. */
export function reportError(e: unknown): number {
  if (e instanceof ApplicationError) {
    console.error(e.message);
    return 1;
  }
  throw e;
}
