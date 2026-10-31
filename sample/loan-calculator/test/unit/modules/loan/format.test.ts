import { amortize } from '@/modules/loan/amortization';
import {
  formatMoney,
  formatTable,
  yearlyInstallments
} from '@/modules/loan/format';

describe('format', () => {
  describe('formatMoney', () => {
    test('formats the cents in the currency', () => {
      expect(formatMoney(107_364, 'EUR')).toBe('€1,073.64');
      expect(formatMoney(5, 'USD')).toBe('$0.05');
    });
  });

  describe('yearlyInstallments', () => {
    test('sums the installments of every year', () => {
      const schedule = amortize({
        principal: 10_000,
        annualRate: 6,
        months: 18
      });
      const years = yearlyInstallments(schedule);

      expect(years.map((year) => year.month)).toEqual([1, 2]);
      expect(years[0].payment).toBe(
        schedule.installments
          .slice(0, 12)
          .reduce((sum, item) => sum + item.payment, 0)
      );
      expect(years[1].balance).toBe(0);
    });
  });

  describe('formatTable', () => {
    test('aligns the first column left and the others right', () => {
      expect(
        formatTable([
          ['Rate', 'Payment'],
          ['5%', '€1.00'],
          ['10.5%', '€100.00']
        ])
      ).toBe('Rate   Payment\n5%       €1.00\n10.5%  €100.00');
    });
  });
});
