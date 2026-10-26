import { inject } from '@appweaver/core';
import { createLogger, Scheduler } from '@appweaver/common';
import { archiveTransactions, buildDailyReport } from './daily-report';
import { daysBefore, toDate } from './dates';

const logger = createLogger('reports');

// Shortly after midnight UTC, once the day is over: yesterday's report, then
// the transactions past their retention
inject(Scheduler).addJob({
  cronTime: '5 0 * * *',
  timeZone: 'UTC',
  onTick: async () => {
    const date = toDate(daysBefore(new Date(), 1));
    const report = await buildDailyReport(date);
    logger.info(
      { date, transactions: report.transactions, net: report.net },
      'Daily report built'
    );

    const archived = await archiveTransactions();
    if (archived > 0) {
      logger.info(`Transactions archived: ${archived}`);
    }
  }
});
