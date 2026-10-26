import { combine, summarize } from '@/features/reports/summary';

describe('summary', () => {
  describe('summarize', () => {
    test('sums the income, the expenses and the net amount of every category', () => {
      expect(
        summarize([
          { kind: 'Income', category: 'Salary', amount: 420_000 },
          { kind: 'Expense', category: 'Rent', amount: 120_000 },
          { kind: 'Expense', category: 'Groceries', amount: 2_350 },
          { kind: 'Expense', category: 'Groceries', amount: 1_150 }
        ])
      ).toEqual({
        transactions: 4,
        income: 420_000,
        expenses: 123_500,
        net: 296_500,
        categories: { Groceries: -3_500, Rent: -120_000, Salary: 420_000 }
      });
    });

    test('sums nothing without transactions', () => {
      expect(summarize([])).toEqual({
        transactions: 0,
        income: 0,
        expenses: 0,
        net: 0,
        categories: {}
      });
    });
  });

  describe('combine', () => {
    test('adds up the summaries and their categories', () => {
      const day = summarize([
        { kind: 'Expense', category: 'Transport', amount: 240 }
      ]);
      const other = summarize([
        { kind: 'Income', category: 'Freelance', amount: 65_000 },
        { kind: 'Expense', category: 'Transport', amount: 480 }
      ]);

      expect(combine([day, other])).toEqual({
        transactions: 3,
        income: 65_000,
        expenses: 720,
        net: 64_280,
        categories: { Freelance: 65_000, Transport: -720 }
      });
    });
  });
});
