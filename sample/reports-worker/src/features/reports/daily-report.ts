import { createLogger } from '@appweaver/common';
import db from '@db/client';
import { DailyReport } from '@/types';
import { datesBetween, dayRange, daysBefore, toDate } from './dates';
import { summarize } from './summary';

const logger = createLogger('reports');

/** The transactions are kept this long, their totals stay in the daily reports. */
export const RETENTION_DAYS = 90;

/**
 * Builds the report of a day from its transactions, replacing the one built before, so a day is built again after
 * late transactions are imported.
 *
 * @param {string} date - The UTC date, `YYYY-MM-DD`.
 * @return {Promise<DailyReport>} The report.
 */
export async function buildDailyReport(date: string): Promise<DailyReport> {
  const { from, to } = dayRange(date);
  const bookings = await db.transaction.findMany({
    where: { occurredAt: { gte: from, lt: to } },
    select: { kind: true, category: true, amount: true }
  });

  const summary = summarize(bookings);
  const report = await db.dailyReport.upsert({
    where: { date },
    create: { date, ...summary },
    update: summary
  });
  logger.debug({ date, transactions: summary.transactions }, 'Report built');
  return report;
}

/**
 * Builds the reports of the days of a period that have none, the days before today only, since today is not over.
 *
 * @param {string} first - The first UTC date.
 * @param {string} last - The last UTC date, included.
 * @param {Date} [now] - The current moment.
 * @return {Promise<number>} The number of reports built.
 */
export async function buildMissingReports(
  first: string,
  last: string,
  now: Date = new Date()
): Promise<number> {
  const today = toDate(now);
  const dates = datesBetween(first, last).filter((date) => date < today);
  const existing = await db.dailyReport.findMany({
    where: { date: { in: dates } },
    select: { date: true }
  });
  const built = new Set(existing.map((report) => report.date));

  const missing = dates.filter((date) => !built.has(date));
  for (const date of missing) {
    await buildDailyReport(date);
  }
  return missing.length;
}

/**
 * Deletes the transactions past the retention whose day has a report, which keeps their totals.
 *
 * @param {Date} [now] - The current moment.
 * @return {Promise<number>} The number of transactions deleted.
 */
export async function archiveTransactions(
  now: Date = new Date()
): Promise<number> {
  const cutoff = daysBefore(
    new Date(`${toDate(now)}T00:00:00.000Z`),
    RETENTION_DAYS
  );
  const oldest = await db.transaction.findFirst({
    where: { occurredAt: { lt: cutoff } },
    orderBy: { occurredAt: 'asc' },
    select: { occurredAt: true }
  });
  if (!oldest) {
    return 0;
  }

  // A day without a report is built first, so no total is lost
  await buildMissingReports(
    toDate(oldest.occurredAt),
    toDate(daysBefore(cutoff, 1)),
    now
  );
  const { count } = await db.transaction.deleteMany({
    where: { occurredAt: { lt: cutoff } }
  });
  return count;
}
