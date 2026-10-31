import {
  datesBetween,
  dayRange,
  daysBefore,
  parseDate,
  toDate
} from '@/features/reports/dates';

describe('dates', () => {
  describe('toDate', () => {
    test('formats the UTC date of a moment', () => {
      expect(toDate(new Date('2026-10-26T23:59:59Z'))).toBe('2026-10-26');
    });
  });

  describe('dayRange', () => {
    test('spans the UTC day', () => {
      expect(dayRange('2026-02-28')).toEqual({
        from: new Date('2026-02-28T00:00:00Z'),
        to: new Date('2026-03-01T00:00:00Z')
      });
    });
  });

  describe('datesBetween', () => {
    test('lists the dates of a period, both ends included', () => {
      expect(datesBetween('2026-12-30', '2027-01-02')).toEqual([
        '2026-12-30',
        '2026-12-31',
        '2027-01-01',
        '2027-01-02'
      ]);
      expect(datesBetween('2026-01-02', '2026-01-01')).toEqual([]);
    });
  });

  describe('daysBefore', () => {
    test('moves a moment by whole days', () => {
      expect(daysBefore(new Date('2026-03-01T12:00:00Z'), 1)).toEqual(
        new Date('2026-02-28T12:00:00Z')
      );
    });
  });

  describe('parseDate', () => {
    test('rejects a date out of the format or the calendar', () => {
      expect(() => parseDate('2026-13-01')).toThrow(
        'Invalid date 2026-13-01, expected YYYY-MM-DD'
      );
      expect(() => parseDate('2026-02-30')).toThrow('Invalid date 2026-02-30');
      expect(() => parseDate('26-10-2026')).toThrow('Invalid date 26-10-2026');
    });
  });
});
