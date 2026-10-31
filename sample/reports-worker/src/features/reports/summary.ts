/** A transaction as the reports read it. */
export type Booking = {
  kind: 'Income' | 'Expense';
  category: string;
  amount: number;
};

/** The totals of a set of transactions, the amounts in cents. */
export type Summary = {
  transactions: number;
  income: number;
  expenses: number;
  net: number;
  /** The net amount of every category, sorted by name. */
  categories: Record<string, number>;
};

/**
 * Sums the transactions: the income and the expenses, the net amount, and the net amount of every category.
 *
 * @param {Booking[]} bookings - The transactions.
 * @return {Summary} The totals.
 */
export function summarize(bookings: Booking[]): Summary {
  const categories: Record<string, number> = {};
  let income = 0;
  let expenses = 0;

  for (const { kind, category, amount } of bookings) {
    const signed = kind === 'Income' ? amount : -amount;
    if (kind === 'Income') {
      income += amount;
    } else {
      expenses += amount;
    }
    categories[category] = (categories[category] ?? 0) + signed;
  }

  return {
    transactions: bookings.length,
    income,
    expenses,
    net: income - expenses,
    categories: Object.fromEntries(
      Object.entries(categories).sort(([a], [b]) => a.localeCompare(b))
    )
  };
}

/** Adds up summaries, i.e. the daily reports of a period. */
export function combine(summaries: Summary[]): Summary {
  const categories: Record<string, number> = {};
  for (const summary of summaries) {
    for (const [category, net] of Object.entries(summary.categories)) {
      categories[category] = (categories[category] ?? 0) + net;
    }
  }

  const sum = (key: 'transactions' | 'income' | 'expenses' | 'net') =>
    summaries.reduce((total, summary) => total + summary[key], 0);
  return {
    transactions: sum('transactions'),
    income: sum('income'),
    expenses: sum('expenses'),
    net: sum('net'),
    categories: Object.fromEntries(
      Object.entries(categories).sort(([a], [b]) => a.localeCompare(b))
    )
  };
}
