import { createTask } from '@appweaver/core';
import db from '@db/client';
import { buildMissingReports } from '@/features/reports/daily-report';
import { daysBefore, parseDate, toDate } from '@/features/reports/dates';
import { formatAmount, formatTable } from '@/features/reports/format';
import { combine, Summary } from '@/features/reports/summary';

/**
 * Prints the daily reports of a period, building the missing ones, then the totals of the period by category, i.e.
 * `weaver run report 2026-10-01 2026-10-31`.
 */
export default createTask({
  description:
    'Prints the daily reports of a period and its totals by category.',
  arguments: {
    from: {
      description: 'The first day, as YYYY-MM-DD (default: 7 days ago).'
    },
    to: { description: 'The last day, as YYYY-MM-DD (default: yesterday).' }
  },
  run: async ({ args }) => {
    const {
      from = toDate(daysBefore(new Date(), 7)),
      to = toDate(daysBefore(new Date(), 1))
    } = args;
    try {
      parseDate(from);
      parseDate(to);
    } catch (e) {
      console.error(
        `${(e as Error).message}\nRun weaver run report --help for its usage`
      );
      return 1;
    }

    const built = await buildMissingReports(from, to);
    const reports = await db.dailyReport.findMany({
      where: { date: { gte: from, lte: to } },
      orderBy: { date: 'asc' }
    });
    if (reports.length === 0) {
      console.log(`No reports from ${from} to ${to}`);
      return 0;
    }

    console.log(
      `Reports from ${from} to ${to}${built > 0 ? `, ${built} built now` : ''}\n`
    );
    console.log(
      formatTable([
        ['Date', 'Transactions', 'Income', 'Expenses', 'Net'],
        ...reports.map((report) => [
          report.date,
          String(report.transactions),
          formatAmount(report.income),
          formatAmount(report.expenses),
          formatAmount(report.net)
        ])
      ])
    );

    const total = combine(
      reports.map((report) => ({
        ...report,
        categories: report.categories as Summary['categories']
      }))
    );
    console.log('');
    console.log(
      formatTable([
        ['Category', 'Net'],
        ...Object.entries(total.categories).map(([category, net]) => [
          category,
          formatAmount(net)
        ]),
        ['Total', formatAmount(total.net)]
      ])
    );
    return 0;
  }
});
