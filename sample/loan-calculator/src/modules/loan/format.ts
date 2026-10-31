import { Installment, Schedule } from './amortization';

/** Formats an amount in cents in the currency, i.e. `€1,073.64`. */
export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).format(
    cents / 100
  );
}

/** Sums the installments of every year, for a shorter table of a long loan. */
export function yearlyInstallments(schedule: Schedule): Installment[] {
  const years: Installment[] = [];
  for (const item of schedule.installments) {
    const year = Math.ceil(item.month / 12);
    const total = years[year - 1];
    if (total) {
      total.payment += item.payment;
      total.principal += item.principal;
      total.interest += item.interest;
      total.balance = item.balance;
    } else {
      years.push({ ...item, month: year });
    }
  }
  return years;
}

/**
 * Formats rows as a text table, the first row being the header and every column after the first aligned right.
 *
 * @param {string[][]} rows - The rows, the header first.
 * @return {string} The table, one line per row.
 */
export function formatTable(rows: string[][]): string {
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => row[column].length))
  );
  return rows
    .map((row) =>
      row
        .map((cell, column) =>
          column === 0
            ? cell.padEnd(widths[column])
            : cell.padStart(widths[column])
        )
        .join('  ')
    )
    .join('\n');
}
