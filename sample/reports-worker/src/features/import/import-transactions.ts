import db from '@db/client';
import { buildDailyReport } from '@/features/reports/daily-report';
import { toDate } from '@/features/reports/dates';
import { TransactionRow } from './csv';

/** The outcome of an import. */
export type ImportResult = {
  imported: number;
  /** The rows whose reference was imported before. */
  skipped: number;
  /** The dates whose report was built again. */
  rebuilt: string[];
};

/**
 * Imports the transactions not imported before, by their reference, and builds again the reports of the past days
 * they belong to, so a late transaction is counted.
 *
 * @param {TransactionRow[]} rows - The transactions.
 * @param {Date} [now] - The current moment.
 * @return {Promise<ImportResult>} The outcome.
 */
export async function importTransactions(
  rows: TransactionRow[],
  now: Date = new Date()
): Promise<ImportResult> {
  const existing = await db.transaction.findMany({
    where: { reference: { in: rows.map((row) => row.reference) } },
    select: { reference: true }
  });
  const known = new Set(existing.map((row) => row.reference));
  // The first row of a reference repeated in the file wins
  const added = rows.filter(
    (row) => !known.has(row.reference) && !!known.add(row.reference)
  );

  await db.transaction.createMany({ data: added });

  const today = toDate(now);
  const rebuilt = [...new Set(added.map((row) => toDate(row.occurredAt)))]
    .filter((date) => date < today)
    .sort();
  for (const date of rebuilt) {
    await buildDailyReport(date);
  }

  return {
    imported: added.length,
    skipped: rows.length - added.length,
    rebuilt
  };
}
