import { amortize, monthlyPayment } from '@/modules/loan/amortization';

describe('amortization', () => {
  describe('monthlyPayment', () => {
    test('pays a loan back in equal installments', () => {
      expect(
        monthlyPayment({ principal: 200_000, annualRate: 5, months: 360 })
      ).toBe(107_364);
      expect(
        monthlyPayment({ principal: 10_000, annualRate: 7.5, months: 36 })
      ).toBe(31_106);
    });

    test('splits a loan without interest evenly, rounded up', () => {
      expect(
        monthlyPayment({ principal: 1_000, annualRate: 0, months: 3 })
      ).toBe(33_334);
    });

    test('rejects the invalid terms, naming each one', () => {
      expect(() =>
        monthlyPayment({ principal: -5, annualRate: 120, months: 0.5 })
      ).toThrow(
        'Invalid loan terms: the principal must be a positive amount, the rate must be between 0 and 100 percent, ' +
          'the term must be between 1 and 600 months'
      );
    });
  });

  describe('amortize', () => {
    test('repays the whole principal by the last installment', () => {
      const schedule = amortize({
        principal: 200_000,
        annualRate: 5,
        months: 360
      });

      expect(schedule.installments).toHaveLength(360);
      expect(schedule.installments.at(-1)!.balance).toBe(0);
      expect(
        schedule.installments.reduce((sum, item) => sum + item.principal, 0)
      ).toBe(20_000_000);
      expect(schedule.totalInterest).toBe(schedule.totalPaid - 20_000_000);
    });

    test('pays the interest on the remaining balance', () => {
      const [first, second] = amortize({
        principal: 12_000,
        annualRate: 12,
        months: 12
      }).installments;

      expect(first).toEqual({
        month: 1,
        payment: 106_619,
        principal: 94_619,
        interest: 12_000,
        balance: 1_105_381
      });
      expect(second.interest).toBe(11_054);
    });

    test('settles the rounding in the last installment', () => {
      const { installments } = amortize({
        principal: 1_000,
        annualRate: 0,
        months: 3
      });

      expect(installments.map((item) => item.payment)).toEqual([
        33_334, 33_334, 33_332
      ]);
    });
  });
});
