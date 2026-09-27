import {
  countWorkingDays,
  proratedAllowance
} from '@/features/leave/working-days';

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe('countWorkingDays', () => {
  test('counts a full week from Monday to Friday', () => {
    expect(countWorkingDays(date('2026-07-06'), date('2026-07-10'))).toBe(5);
  });

  test('skips the weekend in between', () => {
    expect(countWorkingDays(date('2026-07-09'), date('2026-07-14'))).toBe(4);
  });

  test('counts a single working day', () => {
    expect(countWorkingDays(date('2026-07-08'), date('2026-07-08'))).toBe(1);
  });

  test('counts no day for a weekend', () => {
    expect(countWorkingDays(date('2026-07-11'), date('2026-07-12'))).toBe(0);
  });

  test('counts no day when the end comes first', () => {
    expect(countWorkingDays(date('2026-07-10'), date('2026-07-06'))).toBe(0);
  });

  test('ignores the time of day', () => {
    const start = new Date('2026-07-06T17:30:00.000Z');
    const end = new Date('2026-07-07T08:00:00.000Z');

    expect(countWorkingDays(start, end)).toBe(2);
  });
});

describe('proratedAllowance', () => {
  test('grants the full allowance to a hire on the first day of the year', () => {
    expect(proratedAllowance(24, date('2026-01-01'))).toBe(24);
  });

  test('grants half of the allowance to a mid-year hire', () => {
    expect(proratedAllowance(24, date('2026-07-02'))).toBe(12);
  });

  test('grants a quarter of the allowance to an October hire', () => {
    expect(proratedAllowance(24, date('2026-10-01'))).toBe(6);
  });
});
