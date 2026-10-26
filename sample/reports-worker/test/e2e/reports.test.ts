import { Application, createApp } from '@appweaver/core';
import db from '@db/client';
import { importTransactions } from '@/features/import/import-transactions';
import {
  archiveTransactions,
  buildDailyReport,
  buildMissingReports,
  RETENTION_DAYS
} from '@/features/reports/daily-report';
import report from '@/tasks/report';
import { resetTestData } from './support/reset';

/** The reports of the ledger in the test database, on dates no other test file uses. */
describe('Reports', () => {
  let app: Application;

  const book = (
    reference: string,
    occurredAt: string,
    kind: 'Income' | 'Expense',
    category: string,
    amount: number
  ) =>
    db.transaction.create({
      data: {
        reference,
        occurredAt: new Date(occurredAt),
        kind,
        category,
        amount
      }
    });

  beforeAll(async () => {
    app = await createApp();
  });

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('builds the report of a day from its transactions', async () => {
    await book('R-1', '2001-01-01T08:00:00Z', 'Income', 'Salary', 300_000);
    await book('R-2', '2001-01-01T23:59:59Z', 'Expense', 'Rent', 90_000);
    await book('R-3', '2001-01-02T00:00:00Z', 'Expense', 'Rent', 5_000);

    expect(await buildDailyReport('2001-01-01')).toMatchObject({
      date: '2001-01-01',
      transactions: 2,
      income: 300_000,
      expenses: 90_000,
      net: 210_000,
      categories: { Rent: -90_000, Salary: 300_000 }
    });
  });

  test('builds the report again with a late transaction', async () => {
    await buildDailyReport('2001-02-01');

    const { imported, skipped, rebuilt } = await importTransactions([
      {
        reference: 'R-10',
        occurredAt: new Date('2001-02-01T10:00:00Z'),
        kind: 'Expense',
        category: 'Transport',
        amount: 240,
        description: null
      },
      {
        reference: 'R-10',
        occurredAt: new Date('2001-02-01T11:00:00Z'),
        kind: 'Expense',
        category: 'Transport',
        amount: 999,
        description: 'The same reference again'
      }
    ]);

    expect({ imported, skipped, rebuilt }).toEqual({
      imported: 1,
      skipped: 1,
      rebuilt: ['2001-02-01']
    });
    expect(
      await db.dailyReport.findUnique({ where: { date: '2001-02-01' } })
    ).toMatchObject({ transactions: 1, expenses: 240 });
  });

  test('builds only the missing reports of the past days', async () => {
    await buildDailyReport('2001-03-01');

    const built = await buildMissingReports(
      '2001-03-01',
      '2001-03-05',
      new Date('2001-03-04T12:00:00Z')
    );

    expect(built).toBe(2);
    const dates = await db.dailyReport.findMany({
      where: { date: { gte: '2001-03-01', lte: '2001-03-05' } },
      orderBy: { date: 'asc' }
    });
    expect(dates.map((item) => item.date)).toEqual([
      '2001-03-01',
      '2001-03-02',
      '2001-03-03'
    ]);
  });

  test('archives the old transactions, keeping their totals in the reports', async () => {
    const now = new Date('2001-12-31T12:00:00Z');
    const old = new Date(now.getTime() - (RETENTION_DAYS + 1) * 86_400_000);
    await book('R-20', old.toISOString(), 'Expense', 'Utilities', 4_000);
    await book('R-21', '2001-12-30T10:00:00Z', 'Expense', 'Utilities', 5_000);

    expect(await archiveTransactions(now)).toBeGreaterThanOrEqual(1);

    expect(
      await db.transaction.findUnique({ where: { reference: 'R-20' } })
    ).toBeNull();
    expect(
      await db.transaction.findUnique({ where: { reference: 'R-21' } })
    ).not.toBeNull();
    expect(
      await db.dailyReport.findUnique({
        where: { date: old.toISOString().slice(0, 10) }
      })
    ).toMatchObject({ transactions: 1, expenses: 4_000 });
  });

  describe('report task', () => {
    let output: string[];

    beforeEach(() => {
      output = [];
      const collect = (...parts: unknown[]) => {
        output.push(parts.join(' '));
      };
      jest.spyOn(console, 'log').mockImplementation(collect);
      jest.spyOn(console, 'error').mockImplementation(collect);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    test('prints the reports of a period and its totals by category', async () => {
      await book('R-30', '2002-06-01T09:00:00Z', 'Income', 'Salary', 300_000);
      await book('R-31', '2002-06-02T09:00:00Z', 'Expense', 'Groceries', 4_550);

      expect(await report(['2002-06-01', '2002-06-02'])).toBe(0);

      expect(output[0]).toBe(
        'Reports from 2002-06-01 to 2002-06-02, 2 built now\n'
      );
      expect(output[1].split('\n')).toEqual([
        'Date        Transactions    Income  Expenses       Net',
        '2002-06-01             1  3,000.00      0.00  3,000.00',
        '2002-06-02             1      0.00     45.50    -45.50'
      ]);
      expect(output[3].split('\n')).toEqual([
        'Category        Net',
        'Groceries    -45.50',
        'Salary     3,000.00',
        'Total      2,954.50'
      ]);
    });

    test('rejects an invalid date', async () => {
      expect(await report(['2001-02-30'])).toBe(1);

      expect(output[0]).toMatch(
        /^Invalid date 2001-02-30, expected YYYY-MM-DD\nUsage:/
      );
    });
  });
});
