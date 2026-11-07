import { ApplicationError } from '@appweaver/common';
import { createTask, inject } from '@appweaver/core';
import { loanConfig } from '@/modules/loan/config';
import {
  formatMoney,
  formatTable,
  yearlyInstallments
} from '@/modules/loan/format';
import { Schedule } from '@/modules/loan/amortization';
import { LoanCalculator } from '@/modules/loan/loan-calculator';

/**
 * Prints the amortization schedule of a loan, by month or summed by year (the default), with the rate and the term
 * of the config unless given, i.e. `weaver run amortize 150000 4.2 120 --monthly`.
 */
export default createTask({
  description: 'Prints the amortization schedule of a loan, summed by year.',
  arguments: {
    principal: {
      type: 'number',
      required: true,
      description: 'The amount borrowed.'
    },
    rate: {
      type: 'number',
      description: 'The annual interest rate in percent (default: from config).'
    },
    months: {
      type: 'number',
      description: 'The term in months (default: from config).'
    }
  },
  options: {
    monthly: {
      type: 'boolean',
      description: 'Print every month instead of every year.'
    }
  },
  run: async ({ args, options }) => {
    let schedule: Schedule;
    try {
      schedule = await inject(LoanCalculator).calculate({
        principal: args.principal,
        annualRate: args.rate,
        months: args.months
      });
    } catch (e) {
      return reportError(e);
    }
    printSchedule(schedule, options.monthly);
    return 0;
  }
});

/** Prints the invalid terms of a loan instead of the stack of a failed task. */
export function reportError(e: unknown): number {
  if (e instanceof ApplicationError) {
    console.error(e.message);
    return 1;
  }
  throw e;
}

/** Prints the schedule of a loan, by month or summed by year. */
function printSchedule(schedule: Schedule, monthly: boolean): void {
  const money = (cents: number) => formatMoney(cents, loanConfig.CURRENCY);
  const { terms } = schedule;
  const rows = monthly ? schedule.installments : yearlyInstallments(schedule);

  console.log(
    `${money(terms.principal * 100)} at ${terms.annualRate}% over ${terms.months} months: ` +
      `${money(schedule.payment)} a month\n`
  );
  console.log(
    formatTable([
      [
        monthly ? 'Month' : 'Year',
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
}
