import { parseTransactions } from '@/features/import/csv';

const header = 'reference,occurredAt,kind,category,amount,description';

describe('csv', () => {
  describe('parseTransactions', () => {
    test('reads the rows, the amounts in cents', () => {
      const { rows, errors } = parseTransactions(
        `${header}\nB-1,2026-10-02T17:45:00Z,Expense,Groceries,64.30,"Weekly shopping, ""big"""\n` +
          'B-2,2026-10-03T15:20:00Z,Income,Freelance,650,\n'
      );

      expect(errors).toEqual([]);
      expect(rows).toEqual([
        {
          reference: 'B-1',
          occurredAt: new Date('2026-10-02T17:45:00Z'),
          kind: 'Expense',
          category: 'Groceries',
          amount: 6_430,
          description: 'Weekly shopping, "big"'
        },
        {
          reference: 'B-2',
          occurredAt: new Date('2026-10-03T15:20:00Z'),
          kind: 'Income',
          category: 'Freelance',
          amount: 65_000,
          description: null
        }
      ]);
    });

    test('reports every invalid line by its number', () => {
      const { rows, errors } = parseTransactions(
        `${header}\n,yesterday,Refund,,0,\nB-3,2026-10-03,Expense,Rent\n`
      );

      expect(rows).toEqual([]);
      expect(errors).toEqual([
        'Line 2: no reference, invalid date yesterday, invalid kind Refund, no category, invalid amount 0',
        'Line 3: expected 6 values'
      ]);
    });

    test('rejects a file without the header', () => {
      expect(
        parseTransactions('B-1,2026-10-03,Expense,Rent,1,').errors
      ).toEqual([`Expected the header ${header}`]);
    });
  });
});
